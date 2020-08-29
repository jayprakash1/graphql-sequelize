'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _graphql = require('graphql');

var _argsToFindOptions = require('./argsToFindOptions');

var _argsToFindOptions2 = _interopRequireDefault(_argsToFindOptions);

var _relay = require('./relay');

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _dataloaderSequelize = require('dataloader-sequelize');

var _dataloaderSequelize2 = _interopRequireDefault(_dataloaderSequelize);

var _graphqlRelay = require('graphql-relay');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* Copied from graphql-sequelize-crud library src/index.js file - START */
function convertFieldsFromGlobalId(Model, data) {
  // Fix Relay Global ID
  _lodash2.default.each(Object.keys(data), k => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr = Model.rawAttributes[k];
    if (attr.references || attr.primaryKey) {
      var _fromGlobalId = (0, _graphqlRelay.fromGlobalId)(data[k]);

      let id = _fromGlobalId.id;

      // Check if id is numeric.

      if (!_lodash2.default.isNaN(_lodash2.default.toNumber(id))) {
        data[k] = parseInt(id);
      } else {
        data[k] = id;
      }
    }
  });
}
/* Copied from graphql-sequelize-crud library src/index.js file - END */

function resolverFactory(target, options) {
  (0, _dataloaderSequelize2.default)(target);

  var resolver,
      targetAttributes,
      isModel = !!target.getTableName,
      isAssociation = !!target.associationType,
      association = isAssociation && target,
      model = isAssociation && target.target || isModel && target;

  targetAttributes = Object.keys(model.rawAttributes);

  options = options || {};

  (0, _assert2.default)(options.include === undefined, 'Include support has been removed in favor of dataloader batching');
  if (options.before === undefined) options.before = options => options;
  if (options.after === undefined) options.after = result => result;
  if (options.handleConnection === undefined) options.handleConnection = true;

  resolver = function resolver(source, args, context, info) {
    if (options.globalId === true) {
      if (args.id != null) {
        var _fromGlobalId2 = (0, _graphqlRelay.fromGlobalId)(args.id);

        const id = _fromGlobalId2.id;

        args.id = id;
      } else if (args.where != null) {
        convertFieldsFromGlobalId(model, args.where);
      }
    }
    var type = info.returnType,
        list = options.list || type instanceof _graphql.GraphQLList,
        findOptions = (0, _argsToFindOptions2.default)(args, targetAttributes);

    if (options.useMaster === true) {
      findOptions.useMaster = true;
    }

    info = _extends({}, info, {
      type: type,
      source: source
    });

    context = context || {};

    if ((0, _relay.isConnection)(type)) {
      type = (0, _relay.nodeType)(type);
    }

    type = type.ofType || type;

    findOptions.attributes = targetAttributes;

    // TODO: find a better way. Adding request user for various hooks. Earlier whole context was added in graphql-sequelize but it was removed in this commit. https://github.com/mickhansen/graphql-sequelize/commit/eef95ba0d2f9a7f29bcd061a664c930c97c3f3f3 (which might need more investigation ). for now requestUser should work
    findOptions.requestUser = context.user;
    findOptions.logging = findOptions.logging || context.logging;

    return _bluebird2.default.resolve(options.before(findOptions, args, context, info)).then(function (findOptions) {
      if (list && !findOptions.order) {
        findOptions.order = [[model.primaryKeyAttribute, 'ASC']];
      }

      if (association) {
        if (source.get(association.as) !== undefined) {
          // The user did a manual include
          const result = source.get(association.as);
          if (options.handleConnection && (0, _relay.isConnection)(info.returnType)) {
            return (0, _relay.handleConnection)(result, args);
          }

          return result;
        } else {
          return source[association.accessors.get](_extends({}, findOptions)).then(function (result) {
            if (options.handleConnection && (0, _relay.isConnection)(info.returnType)) {
              return (0, _relay.handleConnection)(result, args);
            }
            return result;
          });
        }
      }

      return model[list ? 'findAll' : 'findOne'](findOptions);
    }).then(function (result) {
      return options.after(result, args, context, info);
    });
  };

  return resolver;
}

module.exports = resolverFactory;