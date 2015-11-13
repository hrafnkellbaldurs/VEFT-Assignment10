'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const _ = require('lodash');
const Company = require('./models').Company;
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
  host: 'localhost:9200',
  log: 'trace',
});
const app = express();

/* Helper constants  */
const ADMIN_TOKEN = 'dabs';

const MSG401 = 'You are unauthorized to add a company.';

const MSG404 = 'Company not found.';

const MSG409 = 'A company with the same title already exists.';

/* Pagination defaults */
const PAGE_DEFAULT_ENTRIES = 20;
const PAGE_DEFAULT_START = 0;

/* HELPER FUNCTIONS */

/* Sends a pretty validation error message to the client
  for each validation error that occured. */
function handleValidationError(err, res) {
  let msg = '';
  _.forIn(err.errors, (val, key) => {
    msg = msg.concat(err.errors[key].message + '\n');
  });
  msg = msg.concat('\nTo correctly register a company, you have to format the content like so:\n');
  msg = msg.concat('\n{\n  \"title\": \"CompanyTitle\",\n  \"description\": \"This is a company\",\n');
  msg = msg.concat('  \"url\": \"www.company.com\"\n}\n\nRequired fields are:\ntitle');
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

/* Finds the company with the given id and
    and returns it through the callback function.
    If there is an error, it gets sent through
    the callback function. */
function getCompanyById(id, res, cb) {
  validateId(id, (msg) => {
    if(msg) {
      res.status(412);
      return cb(msg, res, null);
    }
    Company.findOne({'_id': id}, (err, company) => {
      if(err) {
        if(err.name === 'CastError') {
          res.status(404);
          return cb(MSG404, res, null);
        }
        res.status(500);
        return cb(err, res, null);
      }
      if(!company) {
        res.status(404);
        return cb(MSG404, res, null);
      }
      return cb(null, null, company);
    });
  });
}

/* Checks the ADMIN_TOKEN header for errors and Content-Type
    header if the request has content. Sends an error message
    to the callback function if there is an error. */
function checkHeaders(req, res, hasContent, cb) {
  const adminToken = req.headers.admin_token;

  // If ADMIN_TOKEN is missing or is incorrect, the server responds with status code 401
  if(!adminToken || adminToken !== ADMIN_TOKEN) {
    res.status(401);
    return cb(MSG401, res);
  }
  if(hasContent) {
    const contentType = req.headers['content-type'];

    /* If content type in the request header is not [aA]pplication/json,
    the server responds with status code 415 */
    if(_.capitalize(contentType) !== 'Application/json') {
      res.status(415);
      return cb('The \'content-type\' header must be \'[aA]pplication/json\'.', res);
    }
  }
  return cb(null);
}

/* Returns a company with wanted variables.
   If the 'toString' boolean is true, the
   function returns a string representing the
   given company. If the 'withId' boolean is
   true, the function returns the company
   including the company id.*/
function excludeTitles(company, toString, withId) {
  if(!toString) {
    if(!withId) {
      return {
        title: company.title,
        description: company.description,
        url: company.url,
      };
    }
    return {
      id: company._id,
      title: company.title,
      description: company.description,
      url: company.url,
    };
  }
  return '{\n' +
         '  \"id\": \"' + company._id + '\",\n' +
         '  \"title\": \"' + company.title + '\",\n' +
         '  \"description\": \"' + company.description + '\",\n' +
         '  \"url\": \"' + company.url + '\"\n' +
         '}';
}

/* API METHODS */

/* Gets a list of all registered companies. */
app.get('/companies', (req, res) => {
  /* Get query parameters if there are any */
  const page = req.query.page || PAGE_DEFAULT_START;
  const max = req.query.max || PAGE_DEFAULT_ENTRIES;

  /* Search with pagination and sort the list by
     the titles of the companies alphabetically */
  const promise = client.search({
    'index': 'companies',
    'type': 'company',
    'size': max,
    'from': page,
    'body': {
      'query': {
        'match_all': {},
      },
      'sort': [
        { 'title': {'order': 'asc'}},
      ],
    },
  });

  promise.then((docs) => {
    /* Filter each company to display them correctly */
    const mappedDocs = docs.hits.hits.map((d) => {
      return {
        id: d._id,
        title: d._source.title,
        description: d._source.description,
        url: d._source.url,
      };
    });
    res.send(mappedDocs);
  }, (err) => {
    /* If there are no companies created yet.
      This is a workaround since elasticsearch returns
      an 404 status code error if there are no companies
      that have been created */
    if(err.body.error.type === 'index_not_found_exception') {
      return res.status(200).send([]);
    }
    res.status(500).send(err);
  });
});

/* Gets a single company with the given id. */
app.get('/companies/:id', (req, res) => {
  const id = req.params.id;
  getCompanyById(id, res, (err, resErr, company) => {
    if(err) {
      return resErr.send(err);
    }
    res.json(excludeTitles(company, false, true));
  });
});

/* Registers a company. */
app.post('/companies', bodyParser.json(), (req, res) => {
  /* Check if the user is authorized and has the
      correct type of content. */
  checkHeaders(req, res, true, (err, resErr) => {

    if(err) {
      return resErr.send(err);
    }

    const company = req.body;

    /* If a company with the same name exists,
      the server responds with status code 409. */
    Company.findOne({'title': company.title}, (err, doc) => {
      if(err) {
        return res.status(500).send(err);
      }
      if(doc) {
        return res.status(409).send(MSG409);
      }

      // If all is well, save into the database.
      const c = new Company(
        {
          title: company.title,
          description: company.description || '',
          url: company.url || '',
          created: new Date(),
        }
      );

      c.save((err, dbCompany) => {
        if(err) {
          return handleValidationError(err, res);
        }

        const companyId = dbCompany._id.toString();

        // If the company is saved to the database, index it in ES.
        const data = excludeTitles(dbCompany);
        data.created = dbCompany.created;

        const promise = client.index({
          index: 'companies',
          type: 'company',
          id: companyId,
          body: data,
        });

        promise.then((doc) => {
          // Return the company ID to the client.
          res.status(201).json({id: doc._id});
        }, (err) => {
          res.status(500).send(err);
        });
      });
    });
  });
});

/* Updates a preexisting company. */
app.post('/companies/:id', bodyParser.json(), (req, res) => {
  /* Check if the user is authorized and has the
      correct type of content. */
  checkHeaders(req, res, true, (err, resErr) => {
    if(err) {
      return resErr.send(err);
    }

    // Check if the id matches with a registered company.
    const id = req.params.id;
    getCompanyById(id, res, (err, resErr, company) => {
      if(err) {
        return resErr.send(err);
      }
      // Keep the original company for displaying later to the client.
      const oldCompany = excludeTitles(company, true);

      /* If the ID matches, update the company with the
          new information supplied by the client. */
      const newCompany = req.body;
      if(newCompany.title) {
        company.title = newCompany.title;
      }

      if(newCompany.description) {
        company.description = newCompany.description;
      }

      if(newCompany.url) {
        company.url = newCompany.url;
      }

      // Save the changes to the database.
      company.save((err, dbCompany) => {
        if(err) {
          return res.status(500).send(err);
        }

        // If all is well, reindex ElasticSearch.
        const promise = client.index({
          index: 'companies',
          type: 'company',
          id: id,
          body: excludeTitles(dbCompany),
        });

        // Return the result to the client.
        promise.then(() => {
          res.send('The following company has been successfully edited from:\n' +
                    oldCompany + '\n\nTo:\n\n' +
                    excludeTitles(company, true));
        }, (err) => {
          res.status(500).send(err);
        });
      });
    });
  });
});

/* Removes a previously added company. */
app.delete('/companies/:id', (req, res) => {
  /* Check if the user is authorized. */
  checkHeaders(req, res, false, (err, resErr) => {
    if(err) {
      return resErr.send(err);
    }

    /* If the user is authenticated, try to find and
       delete the company. */
    const id = req.params.id;
    getCompanyById(id, res, (err, resErr, company) => {
      // Return the corresponding error message is there is one.
      if(err) {
        return resErr.send(err);
      }

      // If the company exists, try to remove it.
      company.remove((err) => {
        if(err) {
          return res.status(500).send(err);
        }

        /* If the company is successfully removed from
           the database, also delete it from ElasticSearch. */
        const promise = client.delete({
          index: 'companies',
          type: 'company',
          id: id,
        });

        // Return the corresponding message to the client.
        promise.then(() => {
          res.send('The following company has been successfully removed:\n' +
                   excludeTitles(company, true));
        }, (error) => {
          return res.status(500).send(error);
        });
      });
    });
  });
});

/* Used to search for a given company that has been added to Punchy.
  TODO finish this */
app.post('/companies/search', bodyParser.json(), (req, res) => {
  // Update a given company
});

module.exports = app;
