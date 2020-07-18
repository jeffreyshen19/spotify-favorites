let request = require('request'),
    rp = require('request-promise'),
    User = require("./User.js");

const client_id = process.env.CLIENT_ID,
      client_secret = process.env.CLIENT_SECRET,
      redirect_uri = process.env.CALLBACK;

/*
  Returns whether the playlist_id still points to a real playlist
*/
async function playlistExists(access_token, playlist_id){
  if(playlist_id == null) return false;

  let body = await rp({
    uri: 'https://api.spotify.com/v1/me/playlists',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  });

  for(let i = 0; i < body.items.length; i++){
    if(body.items[i].id == playlist_id) return true;
  }

  return false;
}

/*
  Updates the playlist with the 15 recent tracks
*/
async function populatePlaylist(access_token, user_id, playlist_id){
  let d = new Date(),
      tracks = (await rp({
        uri: 'https://api.spotify.com/v1/me/top/tracks',
        headers: { 'Authorization': 'Bearer ' + access_token },
        qs: {
          limit: 15,
          time_range: "short_term"
        },
        json: true
      })).items.map((d) => d.uri);

  //Change description
  await rp({
    uri: 'https://api.spotify.com/v1/users/' + encodeURI(user_id) + '/playlists/' + playlist_id,
    headers: { 'Authorization': 'Bearer ' + access_token, "Content-Type": "application/json" },
    body: JSON.stringify({
      "description": `Last updated ${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} • spotify-favorites.herokuapp.com`
    }),
    method: "PUT",
    dataType: "json"
  });

  // Add New Tracks
  if(tracks.length) await rp({
    uri: "https://api.spotify.com/v1/users/" + encodeURI(user_id) + "/playlists/" + playlist_id + "/tracks",
    headers: {
      'Authorization': 'Bearer ' + access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "uris": tracks
    }),
    method: "POST",
    dataType: "json"
  });
}

/*
  Clears the playlist's existing tracks
*/
async function clearPlaylist(access_token, user_id, playlist_id){
  let tracks = (await rp({
    uri: 'https://api.spotify.com/v1/users/' + encodeURI(user_id) + '/playlists/' + playlist_id + '/tracks',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  })).items.map(function(d){
    return {"uri": d.track.uri}
  });

  if(tracks.length) await rp({
    uri: 'https://api.spotify.com/v1/users/' + encodeURI(user_id) + '/playlists/' + playlist_id + '/tracks',
    headers: { 'Authorization': 'Bearer ' + access_token, "Content-Type": "application/json" },
    body: JSON.stringify({
      "tracks": tracks
    }),
    dataType: "json",
    method: "DELETE"
  });
}

/*
  Creates a new playlist
*/
async function createPlaylist(access_token, user_id){
  // Create new playlist
  let body = await rp({
    uri: "https://api.spotify.com/v1/users/" + encodeURI(user_id) + "/playlists",
    headers: {
      'Authorization': 'Bearer ' + access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "name": "Favorite Songs"
    }),
    dataType: "json",
    method: "POST"
  });

  // Save it to database
  let playlist_id = JSON.parse(body).id;
  await User.update({user_id: user_id}, {playlist_id: playlist_id});
  return playlist_id;
}

/*
  Put it all together!
*/

async function generatePlaylist(refresh_token, user_id, playlist_id){
  //Make sure the access token is up to date
  let access_token;

  try{
    access_token = (await rp({
      uri: 'https://accounts.spotify.com/api/token',
      headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
      form: {
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      },
      json: true,
      method: "POST"
    })).access_token;
  }
  catch{
    return;
  }


  if(await playlistExists(access_token, playlist_id)) await clearPlaylist(access_token, user_id, playlist_id);
  else playlist_id = await createPlaylist(access_token, user_id);

  await populatePlaylist(access_token, user_id, playlist_id);
}

module.exports = {
  generatePlaylist: generatePlaylist
}
