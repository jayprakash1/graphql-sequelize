import { GraphQLList, GraphQLNonNull } from 'graphql';
import _ from 'lodash';
import argsToFindOptions from './argsToFindOptions';
import { isConnection, handleConnection, nodeType } from './relay';
import assert from 'assert';
import Promise from 'bluebird';
import dataLoaderSequelize from 'dataloader-sequelize';
import { fromGlobalId } from 'graphql-relay';
import { EXPECTED_OPTIONS_KEY } from 'dataloader-sequelize';

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

function whereQueryVarsToValues(o, vals) {
  [
    ...Object.getOwnPropertyNames(o),
    ...Object.getOwnPropertySymbols(o)
  ].forEach(k => {
    if (_.isFunction(o[k])) {
      o[k] = o[k](vals);
      return;
    }
    if (_.isObject(o[k])) {
      whereQueryVarsToValues(o[k], vals);
    }
  });
}

function checkIsModel(target) {
  return !!target.getTableName;
}

function checkIsAssociation(target) {
  return !!target.associationType;
}

function resolverFactory(targetMaybeThunk, options = {}) {
  assert(
    typeof targetMaybeThunk === 'function' || checkIsModel(targetMaybeThunk) || checkIsAssociation(targetMaybeThunk),
    'resolverFactory should be called with a model, an association or a function (which resolves to a model or an association)'
  );

  const contextToOptions = _.assign({}, resolverFactory.contextToOptions, options.contextToOptions);

  assert(options.include === undefined, 'Include support has been removed in favor of dataloader batching');
  if (options.before === undefined) options.before = (options) => options;
  if (options.after === undefined) options.after = (result) => result;
  if (options.handleConnection === undefined) options.handleConnection = true;

  return async function (source, args, context, info) {
    let target = typeof targetMaybeThunk === 'function' && !checkIsModel(targetMaybeThunk) ?
                 await Promise.resolve(targetMaybeThunk(source, args, context, info)) : targetMaybeThunk
      , isModel = checkIsModel(target)
      , isAssociation = checkIsAssociation(target)
      , association = isAssociation && target
      , model = isAssociation && target.target || isModel && target
      , type = info.returnType
      , list = options.list ||
        type instanceof GraphQLList ||
        type instanceof GraphQLNonNull && type.ofType instanceof GraphQLList;

    if (options.globalId === true) {
      if( args.id != null ) {
        const {id} = fromGlobalId(args.id);
        args.id = id; 
      } else if (args.where != null) {
        convertFieldsFromGlobalId(model, args.where);
      }
    }

    let targetAttributes = Object.keys(model.rawAttributes)
      , findOptions = argsToFindOptions(args, targetAttributes);

    info = {
      ...info,
      type: type,
      source: source,
      target: target
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
    findOptions.graphqlContext = context;

    _.each(contextToOptions, (as, key) => {
      findOptions[as] = context[key];
    });

    return Promise.resolve(options.before(findOptions, args, context, info)).then(function (findOptions) {
      if (args.where && !_.isEmpty(info.variableValues)) {
        whereQueryVarsToValues(args.where, info.variableValues);
        whereQueryVarsToValues(findOptions.where, info.variableValues);
      }

      if (list && !findOptions.order) {
        findOptions.order = [[model.primaryKeyAttribute, 'ASC']];
      }

      if (association) {
        if (source[association.as] !== undefined) {
          // The user did a manual include
          const result = source[association.as];
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
}

resolverFactory.contextToOptions = {[EXPECTED_OPTIONS_KEY]: EXPECTED_OPTIONS_KEY, requestUser: "user"};

module.exports = resolverFactory;
