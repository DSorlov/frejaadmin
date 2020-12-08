(function($) {
    
    $("#messageClose").on("click", function(e) {
    e.preventDefault();
    $("#loginStatus").text('Reinitializing..');
    socket.emit("authenticationInitRequest", {});
  });
 
  var startTime, requestId;
  const socket = io.connect();
  socket.emit("authenticationInitRequest", {});

  socket.on("authenticationInitResponse", data => {
    $("#loginQR").attr('src','https://resources.test.frejaeid.com/qrcode/generate?qrcodedata='+escape(data.extra.autostart_url));
    $("#loginStatus").text('Waiting.. (0s)')
    requestId = data.id;
    startTime = new Date();
    setTimeout(() => { socket.emit("authenticationResolveRequest", { id: requestId }); }, 2000)
  })

  socket.on("authenticationResolveResponse", data => {
    
    switch (data.status) {
      case 'completed':
          window.location.href = '/'
          break;
      case 'pending': 
        var timeDiff = Math.round((new Date() - startTime)/1000); //in ms
        if (data.code==="pending_user_in_app") $("#loginStatus").text('Processing login.. ('+timeDiff+'s)'); else $("#loginStatus").text('Waiting.. ('+timeDiff+'s)');
        setTimeout(() => { socket.emit("authenticationResolveRequest", { id: requestId }); }, 2000)
        break;
      case 'error':
        requestId = '';
        $("#loginStatus").text('Handling interrupt..');
        $("#loginQR").attr('src','data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');          
        switch (data.code) {
            case 'cancelled_by_user':
              $('#messageTitle').text("Authentication denied");
              $('#messageText').text(data.description);
              $('#messageModal').modal('show');
              break;
            case 'expired_transaction':
            case 'cancelled_by_idp':
              socket.emit("initRequest", {});
              $('#messageModal').modal('hide');
              break;
            default:
              $('#messageTitle').text("Authentication error");
              $('#messageText').text(data.description);
              $('#messageModal').modal('show');
              break;
          }
        break;
      default:
        setTimeout(() => { socket.emit("authenticationResolveRequest", { id: requestId }); }, 2000)
        break;
    }
  })

})(jQuery);
