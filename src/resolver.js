import { GraphQLList } from 'graphql';
import argsToFindOptions from './argsToFindOptions';
import { isConnection, handleConnection, nodeType } from './relay';
import invariant from 'assert';
import Promise from 'bluebird';
import dataLoaderSequelize from 'dataloader-sequelize';
import { fromGlobalId } from 'graphql-relay';
import _ from 'lodash';

/* Copied from graphql-sequelize-crud library src/index.js file - START */
function convertFieldsFromGlobalId(Model, data) {
  // Fix Relay Global ID
  _.each(Object.keys(data), (k) => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr = Model.rawAttributes[k];
    if (attr.references || attr.primaryKey) {
      let {id} = fromGlobalId(data[k]);

      // Check if id is numeric.
      if(!_.isNaN(_.toNumber(id))) {
          data[k] = parseInt(id);
      } else {
          data[k] = id;
      }
    }
  });
}
/* Copied from graphql-sequelize-crud library src/index.js file - END */

function resolverFactory(target, options) {
  dataLoaderSequelize(target);

  var resolver
    , targetAttributes
    , isModel = !!target.getTableName
    , isAssociation = !!target.associationType
    , association = isAssociation && target
    , model = isAssociation && target.target || isModel && target;

  targetAttributes = Object.keys(model.rawAttributes);

  options = options || {};

  invariant(options.include === undefined, 'Include support has been removed in favor of dataloader batching');
  if (options.before === undefined) options.before = (options) => options;
  if (options.after === undefined) options.after = (result) => result;
  if (options.handleConnection === undefined) options.handleConnection = true;

  resolver = function (source, args, context, info) {
    if (options.globalId === true) {
      if( args.id != null ) {
        const {id} = fromGlobalId(args.id);
        args.id = id; 
      } else if (args.where != null) {
        convertFieldsFromGlobalId(model, args.where);
      }
    }
    var type = info.returnType
      , list = options.list || type instanceof GraphQLList
      , findOptions = argsToFindOptions(args, targetAttributes);

    if (options.useMaster === true) {
      findOptions.useMaster = true;
    }

    if (info != null && info.operation != null && info.operation.operation == "mutation" ) {
      findOptions.useMaster = true;
    }

    info = {
      ...info,
      type: type,
      source: source
    };

    context = context || {};

    if (isConnection(type)) {
      type = nodeType(type);
    }

    type = type.ofType || type;

    findOptions.attributes = targetAttributes;

    // TODO: find a better way. Adding request user for various hooks. Earlier whole context was added in graphql-sequelize but it was removed in this commit. https://github.com/mickhansen/graphql-sequelize/commit/eef95ba0d2f9a7f29bcd061a664c930c97c3f3f3 (which might need more investigation ). for now requestUser should work
    findOptions.requestUser = context.user;
    findOptions.logging = findOptions.logging || context.logging;

    return Promise.resolve(options.before(findOptions, args, context, info)).then(function (findOptions) {
      if (list && !findOptions.order) {
        findOptions.order = [[model.primaryKeyAttribute, 'ASC']];
      }

      if (association) {
        if (source.get(association.as) !== undefined) {
          // The user did a manual include
          const result = source.get(association.as);
          if (options.handleConnection && isConnection(info.returnType)) {
            return handleConnection(result, args);
          }

          return result;
        } else {
          return source[association.accessors.get]({...findOptions}).then(function (result) {
            if (options.handleConnection && isConnection(info.returnType)) {
              return handleConnection(result, args);
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
