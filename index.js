require('dotenv').config();

let express = require("express"),
    mongoose = require("mongoose"),
    request = require('request'),
    cors = require('cors'),
    querystring = require('querystring'),
    cookieParser = require('cookie-parser'),
    User = require("./app/User.js")
    spotify = require("./app/spotify.js"),
    generateRandomString = require("./app/generateRandomString.js");

mongoose.connect(process.env.DB_URI || 'mongodb://localhost/spotify_favorites', function(err, res) {
  if(err) console.log("ERROR connecting to database");
  else console.log("SUCCESSfully connected to database");
});

let app = express();
app.use(express.static("public"));
app.use("/bower_components", express.static(__dirname + "/bower_components"));
app.use(cors());
app.use(cookieParser());
app.set('views', './views');
app.set('view engine', 'pug');

////////
const client_id = process.env.CLIENT_ID,
      client_secret = process.env.CLIENT_SECRET,
      redirect_uri = process.env.CALLBACK,
      stateKey = 'spotify_auth_state';

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

              spotify.generatePlaylist(newUser.refresh_token, newUser.user_id, newUser.playlist_id);

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


app.get("/unsubscribe", function(req, res){
  var refresh_token = req.query.refresh_token;
  User.findOneAndDelete({refresh_token: refresh_token}, function (err) {
    if(err) console.log(err);
    res.send("removed");
  });
});

////////

app.get("/", function(req, res){
  res.render("index");
});

console.log("Running on port " + (process.env.PORT || 8888));
app.listen(process.env.PORT || 8888);
