'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const _ = require('lodash');
const models = require('./models');
const app = express();

const ADMIN_TOKEN = 'dabs';

/* HELPER FUNCTIONS */

/* A small string concatonator for 401 messages. */
function msg401(string) {
  return 'You are unauthorized to add a ' + string + '.';
}

/* A small string concatonator for 404 messages. */
function msg404(string) {
  return _.capitalize(string + ' not found.');
}

/* Sends a pretty validation error message to the client
  for each validation error that occured. */
function handleValidationError(err, res) {
  let msg = '';
  _.forIn(err.errors, (val, key) => {
    msg = msg.concat(err.errors[key].message + '\n');
  });
  return res.status(412).send(msg);
}

/* Removes unwanted properties like 'token' and '__v'
  from every user from a list of users. */
function userRemoveUnwanted(users) {
  const result = [];
  for (let i = 0; i < users.length; i++) {
    const temp = users[i];
    const obj = {
      _id: temp._id,
      name: temp.name,
      age: temp.age,
      gender: temp.gender,
    };
    result.push(obj);
  }
  return result;
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
app.get('/company', (req, res) => {
  models.Company.find({}, (err, companies) => {
    if(err) {
      return res.status(500).send(err.message);
    }
    res.json(companyRemoveUnwanted(companies));
  });
});

/* Gets a single company with the given id. */
app.get('/company/:id', (req, res) => {
  const id = req.params.id;
  validateId(id, (msg) => {
    if(msg) {
      return res.status(412).send(msg);
    }
  });
  models.Company.findOne({'_id': id}, (err, company) => {
    if(err) {
      return res.status(500).send(err.message);
    }
    if(!company) {
      return res.status(404).send(msg404('company'));
    }
    res.json(companyRemoveUnwanted([company]));
  });
});

/* Registers a company. */
app.post('/company', bodyParser.json(), (req, res) => {
  const adminToken = req.headers.admin_token;
  // Admin authorization
  if(!adminToken || adminToken !== ADMIN_TOKEN) {
    return res.status(401).send(msg401('company'));
  }

  const c = new models.Company(req.body);

  c.save((err, company) => {
    if(err) {
      return handleValidationError(err, res);
    }
    // Return the company ID to the client
    const companyId = {company_id: company._id};
    res.status(201).json(companyId);
  });
});

/* USER */

/* Gets a list of all registered users */
app.get('/user', (req, res) => {
  models.User.find({}, (err, users) => {
    if(err) {
      return res.status(500).send(err.message);
    }
    // Remove token from each user and send result
    res.json(userRemoveUnwanted(users));
  });
});

/* Registers a user to the database */
app.post('/user', bodyParser.json(), (req, res) => {

  const u = new models.User(req.body);

  u.save((err, user) => {
    if(err) {
      return handleValidationError(err, res);
    }
    // Return the user to the client
    res.status(201).json(user);
  });
});

/* PUNCHCARD */

/* Creates a new punch card for the company with the given company_id
  assigned to the user with the given token.*/
app.post('/punchcard/:company_id', bodyParser.json(), (req, res) => {
  const userToken = req.headers.token;

  // Validate the token
  models.User.findOne({'token': userToken}, (err, user) => {
    if(err) {
      return res.status(500).send(err.message);
    }
    if(!user) {
      return res.status(401).send(msg401('punchcard'));
    }
    // Validate the company ID
    const companyId = req.params.company_id;
    validateId(companyId, (err) => {
      if(err) {
        return res.status(412).send(err);
      }
      // Check if the company exists
      models.Company.findOne({'_id': companyId}, (err, company) => {
        if(err) {
          return res.status(500).send(err.message);
        }
        if(!company) {
          return res.status(404).send(msg404('company'));
        }
        // If the punchCard has not expired, then the created date should be greater than 'punchExpireDate'
        const msInADay = 86400000;
        const punchExpireDate = _.now() - (company.punchcard_lifetime * msInADay);

        // Check if the user already has a active punch card
        models.Punchcard.findOne({'company_id': companyId, 'user_id': userToken,
        'created': { $gt: punchExpireDate } }, (err, cardStillActive) => {
          if(err) {
            return res.status(500).send(err.message);
          }
          if(cardStillActive) {
            return res.status(409).send('This user already has a working punch card for this company.');
          }
          // Validate the post data
          const p = new models.Punchcard(
            {
              company_id: companyId,
              user_id: userToken,
              created: _.now(),
            });

          p.save((err, punchcard) => {
            if(err) {
              return handleValidationError(err, res);
            }
            // Return the punchcard ID to the client
            res.status(201).json({'_id': punchcard._id});
          });
        });
      });
    });
  });
});

module.exports = app;
