const { ObjectId } = require('bson');

const isString = value => typeof value === 'string';

const mapMongooseTypeToSwaggerType = (type, customFieldMapping = {}) => {
  if (!type) {
    return null;
  }

  if (customFieldMapping[type]) {
    return customFieldMapping[type].type;
  }

  if (type === Number || (isString(type) && type.toLowerCase() === 'number')) {
    return 'number';
  }

  if (type === String || (isString(type) && type.toLowerCase() === 'string')) {
    return 'string';
  }

  if (type.schemaName === 'Mixed') {
    return 'object';
  }

  if (type === 'ObjectId' || type === 'ObjectID') {
    return 'string';
  }

  if (type === ObjectId) {
    return 'string';
  }

  if (type === Boolean || (isString(type) && type.toLowerCase() === 'boolean')) {
    return 'boolean';
  }

  if (type === Map) {
    return 'map';
  }

  if (type instanceof Function) {
    // special types
    if (type.name === 'ObjectId' || type.name === 'ObjectID') {
      return 'string';
    }

    if (type.name === 'Date') {
      return 'string';
    }

    if (type.name === 'Decimal128') {
      return 'number';
    }

    const lowercasename = type.name.toLowerCase();

    if (customFieldMapping[lowercasename]) {
      return customFieldMapping[lowercasename].type;
    }

    return lowercasename;
  }

  if (type.type != null) {
    return mapMongooseTypeToSwaggerType(type.type, customFieldMapping);
  }

  if (type.instance) {
    switch (type.instance) {
      case 'Array':
      case 'DocumentArray':
        return 'array';
      case 'ObjectId':
      case 'ObjectID':
      case 'SchemaDate':
        return 'string';
      case 'Mixed':
        return 'object';
      case 'String':
      case 'SchemaString':
      case 'SchemaBuffer':
      case 'SchemaObjectId':
        return 'string';

      case 'SchemaArray':
        return 'array';
      case 'Boolean':
      case 'SchemaBoolean':
        return 'boolean';
      case 'Number':
      case 'Decimal128':
      case 'SchemaNumber':
        return 'number';
      default:
    }
  }

  if (Array.isArray(type)) {
    return 'array';
  }

  if (type.$schemaType) {
    return mapMongooseTypeToSwaggerType(type.$schemaType.tree, customFieldMapping);
  }

  if (type.getters && Array.isArray(type.getters) && type.path != null) {
    return null; // virtuals should not render
  }

  return 'object';
};

const defaultSupportedMetaProps = [
  'enum',
  'required',
  'description',
];
/*
 *{
  value: any;
  key?: string | null;
  props: string[];
  omitFields: string[],
  customFieldMapping?: any
}
*/
const mapSchemaTypeToFieldSchema = ({
  key = null, // null = array field
  value,
  props,
  omitFields,
  customFieldMapping = {},
}) => {
  const swaggerType = mapMongooseTypeToSwaggerType(value, customFieldMapping);
  const meta = {};

  for (const metaProp of props) {
    if (value && value[metaProp] != null) {
      if (metaProp === 'enum' && value[metaProp].values) {
        if (value[metaProp].values instanceof Function) {
          value[metaProp] = Array.from(value[metaProp].values());
        } else {
          value[metaProp] = value[metaProp].values;
        }
      } else {
        meta[metaProp] = value[metaProp];
      }

    }
  }

  if (value === Date || value.type === Date) {
    meta.format = 'date-time';
  } else if (swaggerType === 'array') {
    const arraySchema = Array.isArray(value) ? value[0] : value.type[0];
    const items = mapSchemaTypeToFieldSchema({ value: arraySchema || {}, props, omitFields, customFieldMapping });
    meta.items = items;
  } else if (swaggerType === 'object') {
    let fields = [];
    if (value && value.constructor && value.constructor.name === 'Schema') {
      fields = getFieldsFromMongooseSchema(value, { props, omitFields, customFieldMapping });
    } else {
      const subSchema = value.type ? value.type : value;
      if (subSchema.obj && Object.keys(subSchema.obj).length > 0) {
        fields = getFieldsFromMongooseSchema({ tree: subSchema.tree ? subSchema.tree : subSchema }, { props, omitFields, customFieldMapping });
      } else if (subSchema.schemaName !== 'Mixed') {
        fields = getFieldsFromMongooseSchema({ tree: subSchema.tree ? subSchema.tree : subSchema }, { props, omitFields, customFieldMapping });
      }
    }

    const properties = {};

    for (const field of fields.filter(f => f.type != null)) {
      properties[field.field] = field;
      delete field.field;
    }

    meta.properties = properties;
  } else if (swaggerType === 'map') {
    const subSchema = mapSchemaTypeToFieldSchema({ value: value.of || {}, props, omitFields, customFieldMapping });
    // swagger defines map as an `object` type
    meta.type = 'object';
    // with `additionalProperties` instead of `properties`
    meta.additionalProperties = subSchema;
  }

  const result = {
    type: swaggerType,
    ...meta,
  };

  if (key) {
    result.field = key;
  }

  return result;
};
/*
 *
 * schema: {
  tree: Record<string, any>;
}, options: { props: string[], omitFields: string[], customFieldMapping?: any, omitMongooseInternals?: boolean; }
*/
const getFieldsFromMongooseSchema = (schema, options) => {
  const { props, omitFields, omitMongooseInternals = true, customFieldMapping } = options;
  const omitted = new Set([...(omitMongooseInternals ? ['__v', 'id'] : []), ...omitFields || []]);
  const tree = schema.tree;
  const keys = Object.keys(schema.tree);
  const fields = [];

  // loop over the tree of mongoose schema types
  // and return an array of swagger fields
  for (const key of keys
    .filter(x => !omitted.has(x))
  ) {
    const value = tree[key];

    // swagger object
    const field = mapSchemaTypeToFieldSchema({ key, value, props, omitFields, customFieldMapping });
    const required = [];

    if (field.type === 'object') {
      const { field: propName } = field;
      const fieldProperties = field.properties || field.additionalProperties;
      for (const f of Object.values(fieldProperties)) {
        if (f.required && propName != null) {
          required.push(propName);
          delete f.required;
        }
      }
    }

    if (field.type === 'array' && field.items.type === 'object') {
      field.items.required = [];
      for (const key in field.items.properties) {
        const val = field.items.properties[key];
        if (val.required) {
          field.items.required.push(key);
          delete val.required;
        }
      }

      if (!field.items.required.length) {
        delete field.items.required;
      }
    }

    if (field.type === 'string' && field.enum) {
      if (field.enum.values) {
        if (field.enum.values instanceof Function) {
          field.enum = Array.from(field.enum.values());
        } else {
          field.enum = Array.from(field.enum.values);
        }
      }
    }

    fields.push(field);
  }

  return fields;
};

/**
 * Entry Point
 * @param Model Mongoose Model Instance
 * { props?: string[], omitFields?: string[], omitMongooseInternals?: boolean;, customFieldMapping?: any }
 */
function documentModel(Model, options = {}) {
  let {
    props = [],
    omitFields = [],
    omitMongooseInternals = true,
    customFieldMapping,
  } = options;
  props = [...defaultSupportedMetaProps, ...props];

  /*
   swaggerFieldSchema: {
      for setting field on .properties map - gets removed before returned
      field: string,
      swagger type
      type: string,
    }
  */

  const removeVirtual = swaggerFieldSchema => {
    return swaggerFieldSchema.type != null;
  };

  // console.log('swaggering', Model.modelName);
  const schema = Model.schema;

  // get an array of deeply hydrated fields
  const fields = getFieldsFromMongooseSchema(schema, { props, omitFields, omitMongooseInternals, customFieldMapping });

  // root is always an object
  const obj = {
    title: Model.modelName,
    required: [],
    properties: {},
  };

  // key deeply hydrated fields by field name
  for (const field of fields.filter(removeVirtual)) {
    const { field: fieldName } = field;
    delete field.field;
    obj.properties[fieldName] = field;
    if (field.required && fieldName != null) {
      obj.required.push(fieldName);
      delete field.required;
    }
  }

  if (!obj.required || !obj.required.length) {
    delete obj.required;
  }

  return obj;
}

documentModel.adjustType = mapMongooseTypeToSwaggerType;
documentModel.getFieldsFromMongooseSchema = getFieldsFromMongooseSchema;

module.exports = documentModel;
