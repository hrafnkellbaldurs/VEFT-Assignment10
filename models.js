'use strict';

const mongoose = require('mongoose');
const uuid = require('node-uuid');
const _ = require('lodash');

const CompanySchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 100,
    minlength: 1,
  },
  description: String,
  url: String,
  created: Date,
});

module.exports = {
  Company: mongoose.model('Company', CompanySchema),
};
