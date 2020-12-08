

(function($) {
    "use strict";

    const socket = io.connect();    

    var currentView = "none";
    socket.emit("appInitializationRequest");

    function changeView(newView,force=false) {
        if (currentView===newView&&force==false) return;
        currentView = newView;
        switch(newView) {
            //<% if (session.authenticated.includes('useradmin')) { %>
            case 'userListView':
                $('#orgIdListView').hide();
                $('#pendingOrgIdListView').hide();
                $('#classListView').hide();
                $('#logListView').hide();
                $('#userListView').show();
                break;
            //<% } %>
            //<% if (session.authenticated.includes('logviewer')) { %>
            case 'logListView':
                $('#orgIdListView').hide();
                $('#pendingOrgIdListView').hide();
                $('#classListView').hide();
                $('#userListView').hide();
                $('#logListView').show();
                break;
            //<% } %>
            //<% if (session.authenticated.includes('classadmin')) { %>
                case 'classListView':
                $('#logListView').hide();
                $('#orgIdListView').hide();
                $('#pendingOrgIdListView').hide();
                $('#userListView').hide();
                $('#classListView').show();
                break;
            //<% } %>
            //<% if (session.authenticated.includes('orgidadmin')) { %>
            case 'pendingOrgIdListView':
                $('#logListView').hide();
                $('#orgIdListView').hide();
                $('#userListView').hide();
                $('#classListView').hide();
                socket.emit("pendingOrgIdListRequest");
                $('#pendingOrgIdListView').show();
                break;
            case 'orgIdListView':
                $('#logListView').hide();
                $('#pendingOrgIdListView').hide();
                $('#userListView').hide();
                $('#classListView').hide();
                socket.emit("issuedOrgIdListRequest");
                $('#orgIdListView').show();
                break;
            //<% } %>
            default:
            //<% if (session.authenticated.includes('orgidadmin')) { %>
                changeView("orgIdListView");
            //<% } else if (session.authenticated.includes('useradmin')) { %>
                changeView("userListView");
            //<% } else if (session.authenticated.includes('classadmin')) { %>
                changeView("classListView");
            //<% } else if (session.authenticated.includes('logviewer')) { %>
                changeView("logListView");
            //<% } %>
            break;
        }
    }

    // Initialize the application
    socket.on("appInitializationResponse", response => {
        socket.emit("classListRequest");
        changeView("orgIdListView");
    });

    socket.on("classListResponse", response => {
        var i=0;

        //<% if (session.authenticated.includes('classadmin')) { %>
        var classTable = $('#classListTable').DataTable();
        classTable.clear();
        //<% } %>
        $("#orgIdFilterList").empty();
        $("#newOrgIdClass").empty();            

        response.data.forEach(idClass => {
            i++;
            $("#orgIdFilterList").append("<a class='nav-link' id='orgIdFilterLink"+i+"'>"+idClass.title+"</a>");
            $("#newOrgIdClass").append(new Option(idClass.title,idClass.title+","+idClass.attribute));
            //<% if (session.authenticated.includes('classadmin')) { %>
            classTable.row.add([idClass.title, idClass.attribute, '<button type="button" class="btn btn-primary" data-subject-id="'+idClass.title+'">Delete</button>']);
            //<% } %>
        });
        //<% if (session.authenticated.includes('classadmin')) { %>
        classTable.draw();        
        //<% } %>
    });

    //<% if (session.authenticated.includes('useradmin')) { %>
    $("#userListLink").on("click", function(e) {
        e.preventDefault();
        socket.emit("userListRequest");
        changeView("userListView");
    });
    socket.on("userListResponse", response => {
        var userTable = $('#userListTable').DataTable();
        userTable.clear();
        response.data.forEach(idClass => {
            userTable.row.add([idClass.ssn, idClass.level, '<button type="button" class="btn btn-primary" data-action-id="edit" data-subject-level="'+idClass.level+'" data-subject-id="'+idClass.ssn+'">Edit</button> <button type="button" class="btn btn-primary" data-action-id="delete" data-subject-id="'+idClass.ssn+'">Delete</button>']);
        });
        userTable.draw();
    });

    $("#createAdminLink").on("click", function(e) {
        e.preventDefault();
        $('#userCrEditModalTitle').text("Create new user");
        $('#userCrEditSsn').prop("disabled", false);
        $('#userCrEditSsn').val("");
        $('#userCrEditPermissions').val([]);
        $('#userCrEditModalSubmit').off("click");
        $('#userCrEditModalSubmit').on("click", function() {
            socket.emit("createUserRequest", {
                ssn: $('#userCrEditSsn').val(),
                level: $('#userCrEditPermissions').val().join(",")
            });
        })
        $('#userCrEditModal').modal('show');
    });
    socket.on("createUserResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Add new user failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("userListRequest");
            $('#messageTitle').text("Add new user succeeded");
            $('#messageText').text("The user have been created");
            changeView('userListView',true);
            $('#messageModal').modal('show');
        }
    });
    
    $('#userListTable tbody').on( 'click', 'button', function (e) {
        if (e.target.attributes['data-action-id'].value==="edit") {
            $('#userCrEditModalTitle').text("Edit user");
            $('#userCrEditSsn').prop("disabled", true);
            $('#userCrEditSsn').val(e.target.attributes['data-subject-id'].value);
            $('#userCrEditPermissions').val(e.target.attributes['data-subject-level'].value.split(","));
            $('#userCrEditModalSubmit').off("click");
            $('#userCrEditModalSubmit').on("click", function() {
                socket.emit("changeUserRequest", {
                    ssn: $('#userCrEditSsn').val(),
                    level: $('#userCrEditPermissions').val().join(",")
                })
            })
            $('#userCrEditModal').modal('show');
        } else {
            $('#queryTitle').text("Confirm deletion");
            $('#queryText').html("Please confirm that you wish to remove<br/> the user: <b>"+e.target.attributes['data-subject-id'].value+"</b>.");
            $('#queryDialogContinue').off("click");
            $('#queryDialogContinue').on("click", function() {
                socket.emit("deleteUserRequest", {
                    ssn: e.target.attributes['data-subject-id'].value
                })
            })
            $('#queryDialog').modal('show');    
        }
    });
    socket.on("changeUserResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Edit user failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("userListRequest");
            $('#messageTitle').text("Edit user succeeded");
            $('#messageText').text("The user have been changed");
            changeView('userListView',true);
            $('#messageModal').modal('show');
        }
    });
    socket.on("deleteUserResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Delete user failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("userListRequest");
            $('#messageTitle').text("Delete user succeeded");
            $('#messageText').text("The user have been deleted");
            changeView('userListView',true);
            $('#messageModal').modal('show');
        }
    });
    //<% } %>

    //<% if (session.authenticated.includes('classadmin')) { %>
    socket.on("addClassResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Add new class failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("classListRequest");
            $('#messageTitle').text("Add new class succeeded");
            $('#messageText').text("The class have been created");
            changeView('classListView',true);
            $('#messageModal').modal('show');
        }
    });
    socket.on("deleteClassResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Delete class failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("classListRequest");
            $('#messageTitle').text("Delete class succeeded");
            $('#messageText').text("The class have been deleted");
            changeView('classListView',true);
            $('#messageModal').modal('show');
        }
    });

    $('#classListTable tbody').on( 'click', 'button', function (e) {
        $('#queryTitle').text("Confirm deletion");
        $('#queryText').html("Please confirm that you wish to remove<br/> the class: <b>"+e.target.attributes['data-subject-id'].value+"</b>.");
        $('#queryDialogContinue').off("click");
        $('#queryDialogContinue').on("click", function() {
            socket.emit("deleteClassRequest", { id: e.target.attributes['data-subject-id'].value });
        })
        $('#queryDialog').modal('show');
    } ); 

    $("#classListAll").on("click", function(e) {
        e.preventDefault();
        changeView("classListView");
    });

    $("#createClassLink").on("click", function(e) {
        e.preventDefault();
        $("#newOrgIdClassName").val();
        $("#newOrgIdClassIdentifier").val();
        $('#newOrgIdClassModal').modal('show');
    });   
    
    $("#newOrgIdClassModalSubmit").on("click", function(e) {
        socket.emit("addClassRequest", {
            class: $("#newOrgIdClassName").val(),
            identifier: $("#newOrgIdClassIdentifier").val()
        });
        e.preventDefault();
    });    
    //<% } %>

    //<% if (session.authenticated.includes('orgidadmin')) { %>
    socket.on("issuedOrgIdListResponse", response => {
        var userTable = $('#orgIdTable').DataTable();
        userTable.clear();
        response.users.forEach(idUser => {
            userTable.row.add(["SSN: "+idUser.ssn.ssn, idUser.organisationId.title, idUser.organisationId.identifier, "Registered as " + idUser.registrationState,'<button type="button" class="btn btn-primary" data-subject-id="'+idUser.organisationId.identifier+'" data-subject-text="SSN: '+idUser.ssn.ssn+'">Delete</button>']);
        });
        userTable.draw();
    });    

    socket.on("deleteOrgIdResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Delete OrgID failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("orgIdListRequest");
            $('#messageTitle').text("Delete OrgId succeeded");
            $('#messageText').text("The OrgId have been deleted");
            $('#messageModal').modal('show');
        }
    });

    socket.on("cancelOrgIdResponse", response => {
        if (response.status==="error") {
            $('#messageTitle').text("Delete OrgID failed");
            $('#messageText').text(response.description);
            $('#messageModal').modal('show');            
        } else {
            socket.emit("pendingOrgIdListRequest");
            $('#messageTitle').text("Delete request succeeded");
            $('#messageText').text("The request have been deleted");
            $('#messageModal').modal('show');
        }
    });
    
    socket.on("pendingOrgIdListResponse", response => {
        var userTable = $('#pendingOrgIdTable').DataTable();
        userTable.clear();
        response.data.forEach(idUser => {
            userTable.row.add([idUser.discriminator_type+": "+idUser.discriminator_data, idUser.issue_class, idUser.issue_data, idUser.description + " (" + idUser.code + ")", '<button type="button" class="btn btn-primary" data-request-id="'+idUser.id+'" data-subject-text="'+idUser.discriminator_type+": "+idUser.discriminator_data+'">Cancel</button>']);
        });
        userTable.draw();
    });
    
    socket.on("addOrgIdResponse", data => {
        if (data.status==="error") {
            $('#messageTitle').text("Add new OrgID failed");
            $('#messageText').text(data.description);
            $('#messageModal').modal('show');            
        } else {
            $('#messageTitle').text("Add new OrgID request created");
            $('#messageText').text("The request have been created");
            changeView('pendingOrgIdListView',true);
            $('#messageModal').modal('show');            
        }
    });

    $('#orgIdTable tbody').on( 'click', 'button', function (e) {
        $('#queryTitle').text("Confirm revoking OrgID");
        $('#queryText').html("Please confirm that you wish to revoke<br/><b>"+e.target.attributes['data-subject-id'].value+"</b><br/>"+e.target.attributes['data-subject-text'].value+"</b>.");
        $('#queryDialogContinue').off("click");
        $('#queryDialogContinue').on("click", function() {
            socket.emit("deleteOrgIdRequest", { id: e.target.attributes['data-subject-id'].value });
        })
        $('#queryDialog').modal('show');
    } );

    $('#pendingOrgIdTable tbody').on( 'click', 'button', function (e) {
        $('#queryTitle').text("Confirm cancelling request");
        $('#queryText').html("Please confirm that you wish to cancel the<br/>request for <b>"+e.target.attributes['data-subject-text'].value+"</b>.");
        $('#queryDialogContinue').off("click");
        $('#queryDialogContinue').on("click", function() {
            socket.emit("cancelOrgIdRequest", { id: e.target.attributes['data-request-id'].value });
        })
        $('#queryDialog').modal('show');
    } );

    $("#orgIdFilterList").on("click", 'a', function(e) {
        e.preventDefault();
        changeView("orgIdListView");
        var userTable = $('#orgIdTable').DataTable();
        userTable.column(1).search(e.target.innerText).draw();               
    });            

    $("#orgIdListAll").on("click", function(e) {
        e.preventDefault();
        changeView("orgIdListView");
        var userTable = $('#orgIdTable').DataTable();
        userTable.column(0).search('').draw();
    });

    $("#orgIdViewPendingLink").on("click", function(e) {
        e.preventDefault();
        changeView("pendingOrgIdListView");
    });

    $("#orgIdIssueLink").on("click", function(e) {
        e.preventDefault();
        $("#newOrgIdDiscriminatorType").val($("#target option:first").val());
        $("#newOrgIdDiscriminatorData").val();
        $("#newOrgIdClass").val($("#target option:first").val());
        $("#newOrgIdIdentifier").val();
        $('#issueOrgIdModal').modal('show');
    });
    
    $("#issueOrgIdModalSubmit").on("click", function(e) {
        socket.emit("addOrgIdRequest", {
            type: $("#newOrgIdDiscriminatorType").val(),
            id: $("#newOrgIdDiscriminatorData").val(),
            issue: $("#newOrgIdClass").val(),
            data: $("#newOrgIdIdentifier").val()
        });
        e.preventDefault();
    });
    //<% } %>
    
    //<% if (session.authenticated.includes('logviewer')) { %>
    socket.on("auditListResponse", response => {
        var logListTable = $('#logListTable').DataTable();
        logListTable.clear();
        response.data.forEach(logEntry => {
            logListTable.row.add([logEntry,'<button type="button" class="btn btn-primary" data-request-id="'+logEntry+'"">Download</button>']);
        });
        logListTable.draw();
    });

    $('#logListTable tbody').on( 'click', 'button', function (e) {        
        window.location.href = '/auditlog/download/'+e.target.attributes['data-request-id'].value;
    });    

    $("#logViewLink").on("click", function(e) {
        e.preventDefault();
        socket.emit("auditListRequest");
        changeView("logListView");        
    });    
    //<% } %>

    socket.on("deauthenticationResponse", response => {
        window.location.href = '/';
    });

    $("#signOutLink").on("click", function(e) {
        e.preventDefault();
        socket.emit("deauthenticationRequest");
    });
    
})(jQuery);