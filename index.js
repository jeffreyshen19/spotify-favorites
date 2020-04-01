var express = require("express");
var mongoose = require("mongoose");
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/spotify_favorites', function(err, res) {
  if(err) console.log("ERROR connecting to database");
  else console.log("SUCCESSfully connected to database");
});

var User = mongoose.model("User", new mongoose.Schema({
  refresh_token: String,
  user_id: String,
  playlist_id: String
}));

var app = express();
app.use(express.static("public"));
app.use("/bower_components", express.static(__dirname + "/bower_components"));
app.use(cors());
app.use(cookieParser());
app.set('views', './views');
app.set('view engine', 'pug');

////////
var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your secret
var redirect_uri = process.env.CALLBACK; // Your redirect uri

//Generates a random string for a cookie
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  //Request authorization
  var scope = 'playlist-modify-private playlist-modify-public user-top-read user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        //Save to database
        request.get({
          url: 'https://api.spotify.com/v1/me',
          headers: {
            'Authorization': 'Bearer ' + access_token
          }
        }, function(err, res, body){
          var user_id = JSON.parse(body).id;

          User.find({user_id : user_id}, function (err, docs) {
            if(!docs.length){
              var newUser = new User();
              newUser.user_id = user_id;
              newUser.refresh_token = refresh_token;
              newUser.playlist_id = null;

              generatePlaylist(newUser.refresh_token, newUser.user_id, newUser.playlist_id);

              newUser.save(function(err){});
            }
            else{
              User.update({user_id: user_id}, {
                refresh_token: refresh_token
              }, function(err, numberAffected, rawResponse) {
              });
            }
          });
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});


//Checks if playlist exists
function playlistExists(access_token, playlist_id, callback){
  if(playlist_id == null) callback(false);
  else{
    request.get({
      url: 'https://api.spotify.com/v1/me/playlists',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    }, function(error, response, body) {
      var hasCalledBack = false;
      body.items.forEach(function(el){
        if(el.id == playlist_id) {
          hasCalledBack = true;
          callback(true);
        }
      });
      if(!hasCalledBack) callback(false);
    });
  }
}

//Adds the top 15 songs to the playlist
function populatePlaylist(access_token, user_id, playlist_id){
  //Change description
  request.put({
    url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist_id,
    headers: {
      'Authorization': 'Bearer ' + access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "description": "Last updated " + (new Date()).toUTCString() + " • spotify-favorites.herokuapp.com" 
    }),
    dataType: "json"
  }, function(error, response, body){
  });

  //Change tracks
  request.get({
    url: 'https://api.spotify.com/v1/me/top/tracks',
    headers: { 'Authorization': 'Bearer ' + access_token },
    qs: {
      limit: 15,
      time_range: "short_term"
    },
    json: true
  }, function(error, response, body) {
    body = body.items.map(function(d){
      return d.uri;
    });

    request.post({
      url: "https://api.spotify.com/v1/users/" + user_id + "/playlists/" + playlist_id + "/tracks",
      headers: {
        'Authorization': 'Bearer ' + access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "uris": body
      }),
      dataType: "json"
    }, function(error, response, body){
    });
  });
}

function generatePlaylist(refresh_token, user_id, playlist_id){
  //Make sure the access token is up to date
  request.post({
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  }, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;

      playlistExists(access_token, playlist_id, function(exists){
        if(exists){ //If the playlist exists, just clear it and add new elements
          request.get({
            url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist_id + '/tracks',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
          }, function(error, response, body) {
            body = body.items.map(function(el){
              return {"uri": el.track.uri};
            });

            request.delete({
              url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist_id + '/tracks',
              headers: {
                'Authorization': 'Bearer ' + access_token,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                "tracks": body
              }),
              dataType: "json"
            }, function(error, response, body){
              populatePlaylist(access_token, user_id, playlist_id);
            });
          });
        }
        else{
          request.post({
            url: "https://api.spotify.com/v1/users/" + user_id + "/playlists",
            headers: {
              'Authorization': 'Bearer ' + access_token,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              "name": "Favorite Songs"
            }),
            dataType: "json"
          }, function(error, response, body){
            console.log(user_id);
            console.log(error);
            console.log(response);
            console.log(body);
            playlist_id = JSON.parse(body).id;
            User.update({user_id: user_id}, {
              playlist_id: playlist_id
            }, function(err, numberAffected, rawResponse) {
            });
            populatePlaylist(access_token, user_id, playlist_id);
          });
        }
      });
    }
  });
}

app.get("/unsubscribe", function(req, res){
  var refresh_token = req.query.refresh_token;
  User.remove({refresh_token: refresh_token}, function(err, result){
    res.send("removed");
  });
});

app.get("/generate_playlist", function(req, res){
  if(req.query.secret == process.env.SECRET){
    User.find(function(err, users){
      users.forEach(function(user){
        generatePlaylist(user.refresh_token, user.user_id, user.playlist_id);
      });
    });
    res.send("success");
  }
  else{
    res.send("Error: Incorrect secret");
  }
});

////////

app.get("/", function(req, res){
  res.render("index");
});

console.log("Running on port " + (process.env.PORT || 8888));
app.listen(process.env.PORT || 8888);
