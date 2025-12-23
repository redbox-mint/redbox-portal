module.exports = {
  primaryKey: 'id',
  tableName: 'user',
  attributes: {
    additionalAttributes: {
      type: 'json'
    },
    email: {
      type: 'string',
      required: true,
      unique: true
    },
    lastLogin: {
      type: 'string',
      columnType: 'datetime'
    },
    name: {
      type: 'string',
      required: true
    },
    password: {
      type: 'string'
    },
    roles: {
      dominant: true,
      collection: 'role',
      via: 'users'
    },
    token: {
      type: 'string'
    },
    type: {
      type: 'string',
      required: true
    },
    username: {
      type: 'string',
      required: true,
      unique: true
    },
    workspaceApps: {
      collection: 'workspaceApp',
      via: 'user'
    },
  },
  customToJSON:   function customToJSON() {
      const obj = {};
      if (typeof _ !== 'undefined' && _ && typeof _.assign === 'function') {
          _.assign(obj, this);
          if (typeof _.unset === 'function') {
              _.unset(obj, 'password');
          }
          else {
              delete obj.password;
          }
      }
      else {
          Object.assign(obj, this);
          delete obj.password;
      }
      return obj;
  },
  assignAccessToPendingRecords:   function assignAccessToPendingRecords(user) {
      try {
          if (user.email != null && user.name !== 'Local Admin') {
              UsersService.findAndAssignAccessToRecords(user.email, user.username);
          }
      }
      catch (error) {
          if (typeof sails !== 'undefined' && sails.log && typeof sails.log.error === 'function') {
              sails.log.error('Unable to assign access to pending records');
              sails.log.error(error);
          }
      }
  },
  beforeCreate: (user, cb) => {
      if (!user.password) {
          return cb();
      }
      const bcryptLib = (() => {
          try {
              return require('bcrypt');
          }
          catch (error) {
              if (typeof sails !== 'undefined' && sails.log && typeof sails.log.warn === 'function') {
                  sails.log.warn('Falling back to bcryptjs due to error loading bcrypt', error);
              }
              return require('bcryptjs');
          }
      })();
      bcryptLib.genSalt(10, (err, salt) => {
          if (err) {
              sails.log.error(err);
              return cb(err);
          }
          bcryptLib.hash(user.password, salt, (hashErr, hash) => {
              if (hashErr) {
                  sails.log.error(hashErr);
                  return cb(hashErr);
              }
              user.password = hash;
              return cb();
          });
      });
  },
  afterCreate: (user, cb) => {
      const userModel = typeof globalThis !== 'undefined' ? globalThis.User : undefined;
      if (userModel && typeof userModel.assignAccessToPendingRecords === 'function') {
          userModel.assignAccessToPendingRecords(user);
      }
      cb();
  },
  afterUpdate: (user, cb) => {
      const userModel = typeof globalThis !== 'undefined' ? globalThis.User : undefined;
      if (userModel && typeof userModel.assignAccessToPendingRecords === 'function') {
          userModel.assignAccessToPendingRecords(user);
      }
      cb();
  },
};
