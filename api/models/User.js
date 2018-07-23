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
    lastLogin: {type: 'string', columnType: 'datetime'},
    type : { type: 'string', required: true},
    name : { type: 'string', required: true},
    email: { type: 'string', required: true, unique: true},
    token: { type: 'string'},
    // users have many workspace apps
    workspaceApps: { collection: 'workspaceApp', via: 'user' },
    // users have many roles
    roles: { collection: 'role', via: 'users'}
  },
  customJSON: function() {
      var obj = this.toObject();
      delete obj.password;
      return obj;
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
  },
  afterCreate: function(user, cb) {
    User.assignAccessToPendingRecords(user);
    cb();
  },
  afterUpdate: function(user, cb) {
    User.assignAccessToPendingRecords(user);
    cb();
  },
  assignAccessToPendingRecords: function(user) {
    try {
      if(user.email != null) {
        UsersService.findAndAssignAccessToRecords(user.email, user.username);
      }
    } catch(e) {
      // log and move on
      sails.log.error("Unable to assign access to pending records");
      sails.log.error(e);
    }
  }
};
