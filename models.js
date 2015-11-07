'use strict';

const mongoose = require('mongoose');
const uuid = require('node-uuid');
const _ = require('lodash');

function genderValidator(val) {
  return (val === 'm' || val === 'f' || val === 'o');
}

const UserSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    minlength: 1,
  },
  token: {
    type: String,
    default: uuid.v1(),
  },
  age: Number,
  gender: {
    type: String,
    maxlength: 1,
    minlength: 1,
    validate: [genderValidator, 'Gender can only be \'m\', \'f\' or \'o\'.'],
  },
});

const CompanySchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    minlength: 1,
  },
  description: String,
  punchcard_lifetime: {
    type: Number,
    required: true,
  },
});

const PunchcardSchema = mongoose.Schema({
  company_id: {
    type: String,
    required: true,
    minlength: 12,
  },
  user_id: {
    type: String,
    required: true,
    minlength: 12,
  },
  created: Number,
});

module.exports = {
  Company: mongoose.model('Company', CompanySchema),
  Punchcard: mongoose.model('Punchcard', PunchcardSchema),
  User: mongoose.model('User', UserSchema),
};
