var mongoose = require("mongoose");

module.exports = mongoose.model("User", new mongoose.Schema({
  refresh_token: String,
  user_id: String,
  playlist_id: String
}));
