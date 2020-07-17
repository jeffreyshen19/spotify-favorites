/*
  Refreshes every user in the database, runs daily
*/

require('dotenv').config();
let mongoose = require("mongoose"),
    User = require("./app/User.js"),
    spotify = require("./app/spotify.js");

mongoose.connect(process.env.DB_URI || 'mongodb://localhost/spotify_favorites', function(err, res) {
  if(err) console.log("ERROR connecting to database");
  else console.log("SUCCESSfully connected to database");
});

async function bulkUpdate(){
  let users = await User.find();

  for(const user of users){
    await spotify.generatePlaylist(user.refresh_token, user.user_id, user.playlist_id);
  }

  mongoose.connection.close();
}

bulkUpdate();
