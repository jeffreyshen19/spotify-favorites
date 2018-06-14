(function() {
  /**
   * Obtains parameters from the hash of the URL
   * @return Object
   */
  function getHashParams() {
    var hashParams = {};
    var e, r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
      hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
  }
  var params = getHashParams();
  var access_token = params.access_token,
    refresh_token = params.refresh_token,
    error = params.error;

  if (error) {
    alert('There was an error during the authentication');
  } else {
    if (access_token) {
      $('#login').hide();
      $('#loggedin').show();
      $.ajax({
        url: 'https://api.spotify.com/v1/me',
        headers: {
          'Authorization': 'Bearer ' + access_token
        },
        success: function(response) {
          document.getElementById("header-logged-in").innerHTML = "Logged in as " + response.display_name;
          document.getElementById("unsubscribe").setAttribute("href", "/unsubscribe?refresh_token=" + refresh_token);
        }
      });
    } else {
      // render initial screen
      $('#login').show();
      $('#loggedin').hide();
    }
  }
})();
