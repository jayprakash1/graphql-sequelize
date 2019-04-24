import * as typeMapper from './typeMapper';
import JSONType from './types/jsonType';
import {GraphQLID} from 'graphql';

module.exports = function (Model, options) {
  var result = {}
    , keys = Model.primaryKeyAttributes
    , type;
  
  options = options || {};

  if (keys) {
    keys.forEach(key => {
      var attribute = Model.rawAttributes[key];
      if (attribute) {
        if(options.globalId){
          type = GraphQLID; 
        } else {
          type = typeMapper.toGraphQL(attribute.type, Model.sequelize.constructor);
        }
        result[key] = {
          type: type
        };
      }
    });
  }

  // add where
  result.where = {
    type: JSONType,
    description: 'A JSON object conforming the the shape specified in http://docs.sequelizejs.com/en/latest/docs/querying/'
  };

  return result;
};
