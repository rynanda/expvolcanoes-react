var express = require('express');
var router = express.Router();

const swaggerUI = require('swagger-ui-express');
const swaggerDocument = require('../docs/openapi.json');
const jwt = require('jsonwebtoken');

router.use('/', swaggerUI.serve);
router.get('/', swaggerUI.setup(swaggerDocument));

router.get('/countries', function (req, res, next) {
  req.db
    .from("data")
    .select("country")
    .orderBy("country", "asc")
    .distinct("country")
    .then((countriesData) => {
      const countries = countriesData.map((row) => row.country);
      res.status(200).json(countries);
    })
    .catch((err) => {
      console.log(err);
      res.status(400).json({
        error: true,
        message: "Invalid query parameters. Query parameters are not permitted."
      })
    });
});

router.get('/volcanoes', function (req, res, next) {
  const country = req.query.country;
  const popWithin = req.query.populatedWithin;
  const queries = Object.keys(req.query);
  const validQueries = ['country', 'populatedWithin'];
  const validPopWithin = ['5km', '10km', '30km', '100km'];

  const queryVolcanoes = req.db.from("data").select("id", "name", "country", "region", "subregion");

  // https://stackoverflow.com/questions/8217419/how-to-determine-if-a-javascript-array-contains-an-object-with-an-attribute-that
  if (queries.some(query => !validQueries.includes(query))) {
    res.status(400).json({
      error: true, message: "Invalid query parameters. Only country and populatedWithin are permitted."
    });
  } else if (!country && !popWithin) {
    res.status(400).json({ error: true, message: "Invalid query parameters. Country is a required parameter." })
  } else if (country && !popWithin) {
    queryVolcanoes
      .where("country", "=", country)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (country && (validPopWithin.includes(popWithin))) {
    queryVolcanoes
      .where("country", "=", country)
      .where(`population_${popWithin}`, ">", 0)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (!country && popWithin) {
    res.status(400).json({ error: true, message: "Country is a required query parameter." })
  } else if (!validPopWithin.includes(popWithin)) {
    res.status(400).json({ error: true, message: "Invalid value for populatedWithin. Only: 5km,10km,30km,100km are permitted." })
  }
});

router.get('/volcano/:id', function (req, res, next) {
  const queries = Object.keys(req.query);

  if (!req.headers.authorization) {
    if (queries.length === 0) {
      req.db
        .from("data")
        .select("id", "name", "country", "region", "subregion", "last_eruption", "summit",
          "elevation", "latitude", "longitude")
        .where("id", "=", req.params.id)
        .then((volcano) => {
          if (volcano.length > 0) {
            res.status(200).json(volcano[0]);
          } else {
            res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
          }
        })
    } else {
      res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
    }
  }
  else {
    if (req.headers.authorization.match(/^Bearer /)) {
      const token = req.headers.authorization.replace(/^Bearer /, "");

      try {
        jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {
        res.status(401).json({ error: true, message: "Invalid JWT token" });
        return;
      }

      if (queries.length === 0) {
        req.db
          .from("data")
          .select("id", "name", "country", "region", "subregion", "last_eruption", "summit",
            "elevation", "latitude", "longitude", "population_5km",
            "population_10km", "population_30km", "population_100km")
          .where("id", "=", req.params.id)
          .then((volcano) => {
            if (volcano.length > 0) {
              res.status(200).json(volcano[0]);
            } else {
              res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
            }
          })
      } else {
        res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
      }
    } else {
      res.status(401).json({ error: true, message: "Authorization header is malformed" });
    }
  }
})

router.get('/me', function (req, res, next) {
  res.status(200).json({
    name: "Ryan Indrananda",
    student_number: "n10852565"
  });
  return;
});

module.exports = router;
