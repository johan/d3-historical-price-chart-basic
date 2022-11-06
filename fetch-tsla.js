#! /usr/bin/env node

const fs = require('fs');
const https = require('https');

const url = `https://query1.finance.yahoo.com/v8/finance/chart/TSLA?symbol=TSLA&period1=1277818200&period2=${Math.floor(Date.now()/1e3)}&useYfid=true&interval=1d&includePrePost=true&events=div%7Csplit%7Cearn&lang=en-SG&region=SG&crumb=CKkS1s1cGzF&corsDomain=sg.finance.yahoo.com`;

const curl = (url, dest, cb) => {
  const file = fs.createWriteStream(dest);
  https.get(url, (response) => {
    response.pipe(file);
    file.on('finish', () => file.close(cb));
  });
};

curl(url, 'docs/sample-data.json', () => process.exit(0));
