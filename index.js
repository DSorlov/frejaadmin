const express       = require('express');
const session       = require('express-session')
const bodyParser    = require('body-parser');
const fs            = require('fs');
const ejs           = require('ejs');
const path          = require('path');
const http          = require('http');
const uuid          = require('uuid');
const helmet        = require('helmet');
const favicon       = require('serve-favicon')
const forge         = require("node-forge");
const dateFormat    = require("dateformat");

// Get our config!
const version = process.env.npm_package_version ? process.env.npm_package_version : JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

// Supporting function to gracefully exit on error messages
function errorExit(message) {
  console.log(message);
  process.exit(1);
};

// Check so that the datadirs does actually exist and just silently create them otherwise
if (!fs.existsSync(path.join(__dirname, './data'))) fs.mkdirSync(path.join(__dirname, './data'));
if (!fs.existsSync(path.join(__dirname, './data', 'html'))) fs.mkdirSync(path.join(__dirname, './data', 'html'));
if (!fs.existsSync(path.join(__dirname, './data', 'static'))) fs.mkdirSync(path.join(__dirname, './data', 'static'));
if (!fs.existsSync(path.join(__dirname, './data', 'auditlogs'))) fs.mkdirSync(path.join(__dirname, './data', 'auditlogs'));
if (!fs.existsSync(path.join(__dirname, './data', 'pending'))) fs.mkdirSync(path.join(__dirname, './data', 'pending'));

// If there is no sample config and there is no production, create a sample copy
if (!fs.existsSync(path.join(__dirname, './data', 'config.json'))) {
  try {
    fs.copyFileSync(path.join(__dirname, './sampleconfig.json'), path.join(__dirname, './data', 'config.json'));  
    fs.copyFileSync(path.join(__dirname, './frejaeid_test.pfx'), path.join(__dirname, './data', 'frejaeid_test.pfx'));
  } catch (errir) {
    errorExit('Config error: No configuration file found (config.json) and failed to copy sample'+errir);
  }
}

// Parse the config file
var config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, './data', 'config.json')));
} catch (error) {
  errorExit('Config error: Configuration could not be parsed ('+error+')');
}

// Check for required params in the config, well, as good as possible anyway
try {
  if (!config.eidprovider || !config.eidprovider.client_cert || !config.eidprovider.password) errorExit('Config error: eidprovider section does not exist or contain all required elements');
  if (!config.gui || !config.gui.logo_url || !config.gui.terms_url || !config.gui.privacy_url || !config.gui.help_text || !config.gui.service_title || !config.gui.company_name ) errorExit('Config error: gui section does not exist or contain all required elements');
  if (!config.service || !config.service.port || !config.service.cookie_secret || !config.service.eidprofile || !config.service.auditing || !config.service.hostname) errorExit('Config error: service section does not exist or contain all required elements');
  if (!config.types || !config.types[0].title || !config.types[0].attribute) errorExit('Config error: types section does not exist or contain atleast one id type');
  if (!config.admins || !config.admins[0].ssn || !config.admins[0].level) errorExit('Config error: admins section does not exist or contain all required elements');
  if (!fs.existsSync(path.join(__dirname, './data', config.eidprovider.client_cert))) errorExit('Config error: client_cert cannot be read');
} catch (error) {
  errorExit('Config error: Configuration could not be parsed ('+error+')');
}

// Validate the PFX
try{
  var p12Asn1 = forge.asn1.fromDer(fs.readFileSync(path.join(__dirname, './data', config.eidprovider.client_cert),'binary'));
  var p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.eidprovider.password);
} catch (error) {
  errorExit('Config error: PFX could not be validated ('+error+')');
}

// Setup servers
var app = express();
var httpServer = http.createServer(app);
var io = require("socket.io")(httpServer);

// Sessions
var io_session = require("express-socket.io-session");
var e_session = require("express-session");
var ee_session = e_session({
    secret: config.service.cookie_secret,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: "auto" },
    name: 'sessionid'
});
io.use(io_session(ee_session, { autoSave:true })); 

// Fetch all templates from the disk and enter them into the array
var templates = {};
fs.readdirSync(path.join(__dirname, './templates')).forEach(function (tmplFile) {

  var content;
  if (fs.existsSync(path.join(__dirname, './data/html', tmplFile))) {
    content = fs.readFileSync(path.join(__dirname, './data/html', tmplFile));
  } else {
    content = fs.readFileSync(path.join(__dirname, './templates', tmplFile));
  }  
  var template = ejs.compile(content.toString());
  templates[tmplFile.replace(".","_")] = template;
});

// Supporting function to compare bolleanish strings
function strbool(value) {
  return value=="true" ? true : false;
}

// Add something to the auditlog
function auditlog(lvl,session,message) {
  var ssn = session.user.id;
  var name = session.user.fullname;
  if (config.service.auditing.includes(lvl)) {
    var logfile = dateFormat(new Date(), "yyyymmdd") + ".log"
    var moment = dateFormat(new Date(), "HH:MM:ss.l");
    if (!fs.existsSync(path.join(__dirname, './data/auditlogs'))) fs.mkdirSync(path.join(__dirname, './data/auditlogs'));
    fs.appendFile(path.join(__dirname,'./data/auditlogs',logfile), `${moment};${lvl};${ssn};${name};${message}\r\n`, (err)=>{} );
  }
}

// Create a communication provider with our backend
function initProvider(provider='frejaorgid') {
  const eidprovider   = require('eid-provider')(provider)
  const eidconfig = eidprovider.settings[config.service.eidprofile];
  for(var override in config.eidprovider) {
    if (override==='ca_cert'||override==='jwt_cert'||override==='client_cert'){
      eidconfig[override] = fs.readFileSync(path.join(__dirname, './data', config.eidprovider[override]));
    } else {
      eidconfig[override] = config.eidprovider[override];
    }
  }
  eidprovider.initialize(eidconfig);
  return eidprovider;
}

// Create a generic object for the error pages variables
function commonPageVars(additionalFields = {}) {
  return Object.assign({
    logo_url: config.gui.logo_url,
    help_text: config.gui.help_text,
    terms_url: config.gui.terms_url,
    privacy_url: config.gui.privacy_url,
    company_name: config.gui.company_name,
    service_title: config.gui.service_title,
    moduleversion: version,
    nodeversion: process.version
  }, additionalFields);
}

// ***************************************************************************************
// MAIN APPLICATION CODE
// ***************************************************************************************
// Start the basic server to handle incomming requests
app.set('trust proxy', 1) // trust first proxy
app.use(ee_session);
app.use(helmet());
app.use(bodyParser.urlencoded({extended: true}));
app.use("/resources/", express.static(path.join(__dirname, './resources')));

// Map favicon if it exists
if (fs.existsSync(path.join(__dirname, './data', 'favicon.ico'))) {
  app.use(favicon(path.join(__dirname, './data', 'favicon.ico')))
} else {
  app.use(favicon(path.join(__dirname, './resources', 'favicon.ico')))
}

// If static files exists serve them also!
if (fs.existsSync(path.join(__dirname, './data/static'))) {
  app.use("/static/", express.static(path.join(__dirname, './data/static')));
}

// Show the login form
app.get("/", (req, res) => {

  //req.session.authenticated = ["useradmin","orgidadmin","classadmin","logadmin","logviewer"];
  //req.session.user = {};
  //req.session.user.fullname = "TESTING"; 
  //req.session.user.ssn = { ssn: "198181810101"};
  //req.session.save();
  //res.send(templates['adminform_ejs'](commonPageVars(Object.assign(req))));
  //return;

  if (req.session.authenticated)
    res.send(templates['adminform_ejs'](commonPageVars(Object.assign(req))));
  else
    res.send(templates['loginform_ejs'](commonPageVars()));
});

app.get("/js/:jsname", (req, res) => {
  if (!templates[req.params.jsname.replace(".js","_js")]) { res.status(404).send(templates.error_404_ejs(commonPageVars(req))); return; }
  res.contentType('application/javascript');
  res.send(templates[req.params.jsname.replace(".js","_js")](commonPageVars(req)))
});

app.get("/css/:cssname", (req, res) => {
  if (!templates[req.params.cssname.replace(".css","_css")]) { res.status(404).send(templates.error_404_ejs(commonPageVars(req))); return; }
  res.contentType('text/css');
  res.send(templates[req.params.cssname.replace(".css","_css")](commonPageVars(req)))
});

app.get("/auditlog/download/:logname", (req, res) => {
  if (!req.session.authenticated||!req.session.authenticated.includes('logviewer')) { res.status(403).send(templates.error_403_ejs(commonPageVars(req))); return;} 

  var filename = req.params.logname+".log";
  var filepath = path.join(__dirname, './data/auditlogs', filename);

  if (!fs.existsSync(filepath)) { res.status(404).send(templates.error_404_ejs(commonPageVars(req))); return; }
  auditlog("viewlog",req.session,"auditLogDownload;id="+req.params.logname);
  res.download(filepath);
});

// Handle 404
app.use(function (req, res, next) {
  res.status(404).send(templates.error_404_ejs(commonPageVars(req)));
})

// Handle 500
app.use(function (err, req, res, next) {
  res.status(500).send(templates.error_500(commonPageVars(err)));
})



// Socket listener
io.on("connection", function(socket) {

  socket.on("appInitializationRequest", function() {
    if (!socket.handshake.session.authenticated) { socket.emit("appInitializationResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }

    socket.emit("appInitializationResponse", {
      "status": "completed",
      "privileges": socket.handshake.session.authenticated,
      "userdata": socket.handshake.session.user,
      "servertime": new Date()
    }); 

  });

  socket.on("issuedOrgIdListRequest", function() {
    if (!socket.handshake.session.authenticated) { socket.emit("issuedOrgIdListResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')) { socket.emit("issuedOrgIdListResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    var eidClient = initProvider('frejaorgid');
    eidClient.getOrgIdList().then(function(result){
      auditlog("list",socket.handshake.session,"issuedOrgIdListRequest");
      socket.emit("issuedOrgIdListResponse", result); 
    });
  }); 

  socket.on("addOrgIdRequest", function(data) {
    if (!socket.handshake.session.authenticated) { socket.emit("addOrgIdResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')) { socket.emit("addOrgIdResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    try {
      var eidClient = initProvider('frejaorgid');
      var idObject = {type: data.type};
      idObject[data.type.toLowerCase()] = data.id;
      var issue = data.issue.split(",");
    } catch (error) {
      socket.emit("addOrgIdResponse", { status: "error", code: "validation_failed", description: "The supplied data was in the wrong format."});
      return;
    }

    eidClient.initAddOrgIdRequest(idObject,issue[0],issue[1],data.data).then(function(result) {
      if (result.status==='initialized') fs.appendFile(path.join(__dirname,'./data/pending',result.id+'.json'), JSON.stringify({
        discriminator_type: data.type,
        discriminator_data: data.id,
        issue_class: issue[0],
        issue_field: issue[1],
        issue_data: data.data
      }), (err)=>{} );
      auditlog("orgid",socket.handshake.session,"addOrgIdRequest;type="+data.type+";discriminator="+data.id+";class="+issue+";identifier="+data.data);
      socket.emit("addOrgIdResponse", result);
    });
  });  

  socket.on("cancelOrgIdRequest", function(data) {
    if (!socket.handshake.session.authenticated) { socket.emit("cancelOrgIdResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')) { socket.emit("cancelOrgIdResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    var eidClient = initProvider('frejaorgid');
    eidClient.cancelAddOrgIdRequest(data.id).then(function(result){
      auditlog("orgid",socket.handshake.session,"cancelOrgIdRequest;id="+data.id);
      socket.emit("cancelOrgIdResponse", result); 
    });
  });  

  socket.on("deleteOrgIdRequest", function(data) {
    if (!socket.handshake.session.authenticated) { socket.emit("deleteOrgIdResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')) { socket.emit("deleteOrgIdResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    var eidClient = initProvider('frejaorgid');
    eidClient.deleteOrgIdRequest(data.id).then(function(result){
      auditlog("orgid",socket.handshake.session,"deleteOrgIdRequest;id="+data.id);
      socket.emit("deleteOrgIdResponse", result); 
    });
  });   

  socket.on("pendingOrgIdListRequest", async function() {
    if (!socket.handshake.session.authenticated) { socket.emit("pendingOrgIdListResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')) { socket.emit("pendingOrgIdListResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    var response = [];
    var eidClient = initProvider('frejaorgid');

    for (const tmplFile of fs.readdirSync(path.join(__dirname, './data/pending'))) {
      var requestId = tmplFile.replace(".json","");
      var fileData = JSON.parse(fs.readFileSync(path.join(__dirname, './data/pending', tmplFile),'utf-8'));
      fileData["id"] = requestId;
      var statusData = await eidClient.pollAddOrgIdStatus(requestId)
      if (statusData.status==="created") {
        fs.unlinkSync(path.join(__dirname, './data/pending', tmplFile))         
      } else {
        response.push(Object.assign(fileData, statusData));
      }
    }

    auditlog("list",socket.handshake.session,"pendingOrgIdListRequest");
    socket.emit("pendingOrgIdListResponse", { status: "completed", data: response});

  }); 

  //USERADMIN
  socket.on("userListRequest", function() {
    if (!socket.handshake.session.authenticated) { socket.emit("userListResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('useradmin')) { socket.emit("userListResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    auditlog("list",socket.handshake.session,"userListRequest");
    socket.emit("userListResponse", { status: "completed", data: config.admins, puppetmaster: (config.service.puppetmaster)  ? config.service.puppetmaster : "n/a"});
  });

  socket.on("createUserRequest", function(request) {
    if (!socket.handshake.session.authenticated) { socket.emit("createUserResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('useradmin')) { socket.emit("createUserResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    config.admins.push({ssn: request.ssn, level: request.level});

    try {
      fs.writeFileSync(path.join(__dirname, './data', 'config.json'), JSON.stringify(config,null,2));
      auditlog("user",socket.handshake.session,"createUserRequest;ssn="+request.ssn+";level="+request.level);
      socket.emit("createUserResponse", {result: "success"}); 
    } catch (error) {
      socket.emit("createUserResponse", {result: "error", description: error, code: "internal_error"});       
    }
  });

  socket.on("changeUserRequest",  function(request) {
    if (!socket.handshake.session.authenticated) { socket.emit("changeUserResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('useradmin')) { socket.emit("changeUserResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    if (socket.handshake.session.user.ssn===request.ssn&&!socket.handshake.session.user.ssn===config.service.puppetmaster) { socket.emit("changeUserResponse", { status: "error", code: "permission_denied", description: "Cannot modify self unless you are the puppetmaster" }); return; }

    config.admins.forEach(function(obj) {
      if (obj.ssn === request.ssn) {
        obj.level = request.level;
      }
    });

    try {
      fs.writeFileSync(path.join(__dirname, './data', 'config.json'), JSON.stringify(config,null,2));
      auditlog("user",socket.handshake.session,"changeUserRequest;ssn="+request.ssn+";level="+request.level);
      socket.emit("changeUserResponse", {result: "success"}); 
    } catch (error) {
      socket.emit("changeUserResponse", {result: "error", description: error, code: "internal_error"});       
    }
  });

  socket.on("deleteUserRequest", function(request) {
    if (!socket.handshake.session.authenticated) { socket.emit("deleteUserResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('useradmin')) { socket.emit("deleteUserResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    if (socket.handshake.session.user.ssn===request.ssn&&!socket.handshake.session.user.ssn===config.service.puppetmaster) { socket.emit("deleteUserResponse", { status: "error", code: "permission_denied", description: "Cannot delete self unless you are the puppetmaster" }); return; }

    config.admins = config.admins.filter(item => item.ssn !== request.ssn);

    try {
      fs.writeFileSync(path.join(__dirname, './data', 'config.json'), JSON.stringify(config,null,2));
      auditlog("user",socket.handshake.session,"deleteUserRequest;ssn="+request.ssn);
      socket.emit("deleteUserResponse", {result: "success"}); 
    } catch (error) {
      socket.emit("deleteUserResponse", {result: "error", description: error, code: "internal_error"});       
    }
  });


  //LOGFILE MANAGEMENT
  socket.on("auditListRequest", function() {
    if (!socket.handshake.session.authenticated) { socket.emit("auditListResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('logviewer')) { socket.emit("auditListResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    var result = [];
    fs.readdirSync(path.join(__dirname, './data/auditlogs')).forEach(function (tmplFile) {
      result.push(tmplFile.slice(0, -4));
    });

    auditlog("log",socket.handshake.session,"auditListRequest");
    socket.emit("auditListResponse", { status: "completed", data: result});
  }); 

  //REQUESTS TO HANDLE CLASSES AND CLASS ADMINISTRATION
  socket.on("classListRequest", function() {
    if (!socket.handshake.session.authenticated) { socket.emit("classListResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('orgidadmin')&&!socket.handshake.session.authenticated.includes('classadmin')) { socket.emit("classListResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    socket.emit("classListResponse", { status: "completed", data: config.types});
  }); 

  socket.on("addClassRequest", function(data) {
    if (!socket.handshake.session.authenticated) { socket.emit("addClassResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('classadmin')) { socket.emit("addClassResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    config.types.push({title: data.class, attribute: data.identifier});

    try {
      fs.writeFileSync(path.join(__dirname, './data', 'config.json'), JSON.stringify(config,null,2));
      auditlog("orgid",socket.handshake.session,"addClassRequest;class="+data.class+"identifier="+data.identifier);
      socket.emit("addClassResponse", {result: "success"}); 
    } catch (error) {
      socket.emit("addClassResponse", {result: "error", description: error, code: "internal_error"});       
    }
  });

  socket.on("deleteClassRequest", function(data) {
    if (!socket.handshake.session.authenticated) { socket.emit("deleteClassResponse", { status: "error", code: "not_authenticated", description: "The session is not authenticated" }); return; }
    if (!socket.handshake.session.authenticated.includes('classadmin')) { socket.emit("deleteClassResponse", { status: "error", code: "permission_denied", description: "The session is not authorized to use this operation" }); return; }

    config.types = config.types.filter(item => item.title !== data.id);

    try {
      fs.writeFileSync(path.join(__dirname, './data', 'config.json'), JSON.stringify(config,null,2));
      auditlog("orgid",socket.handshake.session,"deleteClassRequest;class="+data.id);
      socket.emit("deleteClassResponse", {result: "success"}); 
    } catch (error) {
      socket.emit("deleteClassResponse", {result: "error", description: error, code: "internal_error"});       
    }
  });

  //REQUESTS TO HANDLE AUTHENTICATION TO THE APP  
  socket.on("authenticationInitRequest", function() {
    var eidClient = initProvider('frejaeid');

    var idObject = {type: 'INFERRED'};
    idObject['inferred'] = 'N/A';

    eidClient.initAuthRequest(idObject).then(function(result){
        socket.emit("authenticationInitResponse", result); 
    });
  });

  socket.on("deauthenticationRequest", function() {
    auditlog("auth",socket.handshake.session,"deauthenticationRequest");
    delete socket.handshake.session.authenticated;
    delete socket.handshake.session.user;
    socket.handshake.session.save();
    socket.emit("deauthenticationResponse", { status: "completed"});
  });

  socket.on("authenticationResolveRequest", function(data) {
    var eidClient = initProvider('frejaeid');
    eidClient.pollAuthStatus(data.id).then(function(result){

      if (result.status === 'completed') {

        if (config.service.puppetmaster && config.service.puppetmaster===result.user.id) {
          socket.handshake.session.authenticated = ["useradmin","orgidadmin","classadmin","logadmin","logviewer"];
          socket.handshake.session.user = {};
          socket.handshake.session.user.fullname = "PUPPETMASTER"; 
          socket.handshake.session.user.id = config.service.unmutable_admin;
          socket.handshake.session.save();        
          auditlog("auth",socket.handshake.session,"authenticationResolveRequest(puppetmaster)");
          socket.emit("authenticationResolveResponse", { status: 'completed' });
          return;
        }

        config.admins.forEach(admin => {
          if (admin.ssn === result.user.id) {
            socket.handshake.session.authenticated=admin.level.split(",");
            socket.handshake.session.user = result.user;
            socket.handshake.session.save();
            auditlog("auth",socket.handshake.session,"authenticationResolveRequest");
            socket.emit("authenticationResolveResponse", { status: 'completed' }); 
            return;
          }
        });

        socket.emit("authenticationResolveResponse", { status: 'error', description: 'User is not permitted in application', code: 'backend_exception' }); 
      }
      else {
        socket.emit("authenticationResolveResponse", result); 
      }

    });    
  });

});

// Start the https server
httpServer.listen(config.service.port, () => {
  console.log('Server running on port '+config.service.port);
});
