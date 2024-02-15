module.exports = {
  "extends": "xo-space",
  "env": {
    "mocha": true
  },
  "plugins": [
    'chai-friendly'
  ],
  "parserOptions": {
    "ecmaFeatures": {
      "experimentalObjectRestSpread": true,
    },
    "sourceType": "module"
  },
  "rules": {
    "guard-for-in": [0],
    "no-multiple-empty-lines": 1,
    "capitalized-comments": 0,
    'no-unused-expressions': 0,
    "chai-friendly/no-unused-expressions": [2, { "allowShortCircuit": true }],
    'object-curly-spacing': 0,
    'no-unused-vars': 0,
    'comma-dangle': 0,
    'no-eq-null': 0,
    'eqeqeq': 0,
    'complexity': 0,
    'padded-blocks': 0,
    'padding-line-between-statements': 0,
    'valid-jsdoc': 0,
    'semi': [2, 'always'],
    'comma-dangle': [2, 'always-multiline'],
  }
}
