'use strict';

const express = require('express');
const api = require('./api');
const mongoose = require('mongoose');
const port = 4000;
const app = express();
app.use('/api', api);

// Connect to mongodb
mongoose.connect('localhost/app');
mongoose.connection.once('open', () => {
  console.log('Mongoose is connected');
  app.listen(port, () => {
    console.log('Server starting on port', port);
  });
});
