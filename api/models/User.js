/**
 * User.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */
var bcrypt = require('bcrypt');
module.exports = {
  attributes: {
    username : { type: 'string', required: true, unique: true },
    password : { type: 'string' },
    type : { type: 'string', required: true},
    name : { type: 'string', required: true},
    email: { type: 'string'},
    // users have many roles
    roles: { collection: 'role', via: 'users'},
    toJSON: function() {
        var obj = this.toObject();
        delete obj.password;
        return obj;
    }
  },
  beforeCreate: function(user, cb) {
    if (user.password) {
      bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(user.password, salt, function(err, hash) {
          if (err) {
              sails.log.error(err);
              cb(err);
          } else {
              user.password = hash;
              cb();
          }
        });
      });
    } else {
      cb();
    }
  }
};
