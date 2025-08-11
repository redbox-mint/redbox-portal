module.exports = function (req, res, next) {
    if (req.method === 'HEAD') {
      return res.badRequest('Bad Request: HEAD method is not allowed');;
    }
    return next();
  };