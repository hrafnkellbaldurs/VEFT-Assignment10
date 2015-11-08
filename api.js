'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const _ = require('lodash');
const models = require('./models');
const app = express();

const ADMIN_TOKEN = 'dabs';

/* A small string for 401 messages. */
const msg401 = 'You are unauthorized to add a company.';

/* A small string for 404 messages. */
const msg404 = 'Company not found';

/* HELPER FUNCTIONS */

/* Sends a pretty validation error message to the client
  for each validation error that occured. */
function handleValidationError(err, res) {
  let msg = '';
  _.forIn(err.errors, (val, key) => {
    msg = msg.concat(err.errors[key].message + '\n');
  });
  return res.status(412).send(msg);
}

/* Validates the given id to prevent mongodb from sending
  an internal server error if the given id is not of the right format. */
function validateId(id, cb) {
  if(id.length < 12) {
    return cb('Company ID must be at least 12 characters');
  }
  if(typeof id !== 'string') {
    return cb('Company ID must be a string');
  }
  cb(null);
}

/* Removes the '__v' property from every company
  from a list of companies. */
function companyRemoveUnwanted(companies) {
  const result = [];
  for (let i = 0; i < companies.length; i++) {
    const temp = companies[i];
    const obj = {
      _id: temp._id,
      name: temp.name,
      description: temp.description,
      punchcard_lifetime: temp.punchcard_lifetime,
    };
    result.push(obj);
  }
  return result;
}

/* COMPANY */

/* Gets a list of all registered companies. */
app.get('/companies', (req, res) => {
  models.Company.find({}, (err, companies) => {
    if(err) {
      return res.status(500).send(err);
    }
    res.json(companyRemoveUnwanted(companies));
  });
});

/* Gets a single company with the given id. */
app.get('/companies/:id', (req, res) => {
  const id = req.params.id;
  validateId(id, (msg) => {
    if(msg) {
      return res.status(412).send(msg);
    }
  });
  models.Company.findOne({'_id': id}, (err, company) => {
    if(err) {
      return res.status(500).send(err);
    }
    if(!company) {
      return res.status(404).send(msg404);
    }
    res.json(companyRemoveUnwanted([company]));
  });
});

/* Registers a company. */
app.post('/companies', bodyParser.json(), (req, res) => {
  const adminToken = req.headers.admin_token;
  const contentType = req.headers['content-type'];

  // If ADMIN_TOKEN is missing or is incorrect, the server responds with status code 401
  if(!adminToken || adminToken !== ADMIN_TOKEN) {
    return res.status(401).send(msg401);
  }
  // If content type in the request header is not application/json, the server responds with status code 415
  if(contentType !== 'application/json') {
    return res.status(415).send('The \'content-type\' header must be \'application/json\'.');
  }

  // If a company with the same name exists, the server responds with status code 409

  //TODO check if a company name exists

  //TODO if preconditions are met then the company is written to mongodb and elasticsearch.

  return res.send('ok');
  /* const c = new models.Company(req.body);

  c.save((err, company) => {
    if(err) {
      return handleValidationError(err, res);
    }
    // Return the company ID to the client
    const companyId = {company_id: company._id};
    res.status(201).json(companyId);
});*/
});

/* Updates a preexisting company. */
app.post('/companies/:id', bodyParser.json(), (req, res) => {
  // Update a given company
});

/* Removes a previously added company. */
app.delete('/companies/:id', (req, res) => {
  // Remove a previously added company
});

/* Used to search for a given company that has been added to Punchy. */
app.post('/companies/search', bodyParser.json(), (req, res) => {
  // Update a given company
});

module.exports = app;
