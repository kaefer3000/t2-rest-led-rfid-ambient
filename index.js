//
// Serves the ambient and the relay module on HTTP.
//
// TODO: LDP headers and implementation streamlining
// Author: kaefer3000
//

// Import the interface to Tessel hardware
var tessel = require('tessel');
// Load the interface to the ambient sensor
var ambientlib = require('ambient-attx4');
// Load the interface to the rfid sensor
var rfidlib = require('rfid-pn532');
// Load the interface to the relay
var relaylib = require('relay-mono');
// Load the web framework
var express = require('express');
// Load the logger for the web framework
var logger = require('morgan');
// Load RDF
var rdf = require('rdf-ext')
// Load the RDF parsers for HTTP messages
var rdfBodyParser = require('rdf-body-parser');
var RdfXmlSerializer = require('rdf-serializer-rdfxml');

// The root app
app = express();

// Preparing to use my rdf/xml serialiser
var formatparams = {};
formatparams.serializers = new rdf.Serializers();
formatparams.serializers['application/rdf+xml'] = RdfXmlSerializer;
var formats = require('rdf-formats-common')(formatparams);

var configuredBodyParser = rdfBodyParser({'defaultMediaType' : 'text/turtle', 'formats' : formats});

app.use(configuredBodyParser);

// read as fast as possible
var rfid = rfidlib.use(tessel.port['A'], { read: true, delay: 0 });
var ambient = ambientlib.use(tessel.port['B']);

// The two routers for the sensors/actuators
var ambientApp = express.Router({ 'strict' : true });
var rfidApp = express.Router({ 'strict' : true });
var ledApp = express.Router({ 'strict' : true });

// configuring the app
app.set('json spaces', 2);
app.set('case sensitive routing', true);
app.set('strict routing', true);
app.use(logger('dev'));

// defining a utility method that redirects (301) missing trailing slashes
var redirectMissingTrailingSlash = function(request, response, next) {
  if (!request.originalUrl.endsWith('/'))
    response.redirect(301, request.originalUrl + '/');
  else
    next();
};

// wiring the apps and routers
app.use("/ambient", ambientApp);
app.use("/rfid",   rfidApp);

// LDP description of the root app
var rootRdfGraph = rdf.createGraph();
rootRdfGraph.addAll(
  [
    new rdf.Triple(
      new rdf.NamedNode('#it'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/Platform')),
    new rdf.Triple(
      new rdf.NamedNode('#it'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('ambient/sound#sensor')),
    new rdf.Triple(
      new rdf.NamedNode('#it'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('ambient/light#sensor')),
    new rdf.Triple(
      new rdf.NamedNode('#it'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('leds/#bar')),
   new rdf.Triple(
      new rdf.NamedNode('#it'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('rfid/#sensor'))
  ])

app.all('/', redirectMissingTrailingSlash);
app.get('/', function(request, response) {
  response.sendGraph(rootRdfGraph);
});

var ambientAppLightGraph = rdf.createGraph();
ambientAppLightGraph.addAll(
  [
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/SensorOutput')),
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://purl.org/linked-data/cube#Observation')),
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/isPrimaryTopicOf'),
      new rdf.NamedNode('')),
   new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/isValueOf'),
      new rdf.NamedNode('#sensorOutput')),
   new rdf.Triple(
      new rdf.NamedNode('#sensorOutput'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/isProducedBy'),
      new rdf.NamedNode('#sensor')),
  ])
// describing the light sensor
ambientApp.route("/light").get(function (request, response) {

  ambient.getLightLevel(function(err, data) {
    if (err) {
      response.status(500);
      response.send(err);
      return;
    }
    response.sendGraph(
      ambientAppLightGraph.merge(
        [ new rdf.Triple(
            new rdf.NamedNode('#value'),
            new rdf.NamedNode('http://example.org/hasLightValue'),
            new rdf.Literal(data))
        ]))
  });
});

// describing the sound sensor
ambientApp.route('/sound').get(function (request, response) {

  ambient.getSoundLevel(function(err, data) {
    if (err) {
      response.status(500);
      response.send(err);
      return;
    }
    response.sendGraph(
      ambientAppLightGraph.merge(
        [ new rdf.Triple(
            new rdf.NamedNode('#value'),
            new rdf.NamedNode('http://example.org/hasSoundValue'),
            new rdf.Literal(data))
        ]))
  });
});

var ambientAppGraph = rdf.createGraph();
ambientAppGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#IndirectContainer')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#hasMemberRelation'),
      new rdf.NamedNode('http://example.org/hasSensorValue')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#insertedContentRelation'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/primaryTopic')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#IndirectContainer'))
]);

// LDP description of the sensors of the ambient module
ambientApp.route('/').all(redirectMissingTrailingSlash);
ambientApp.route('/').get(function(request, response) {

  var ret = ambientAppGraph.clone()
  if (ambientApp.stack)
    ambientApp.stack.forEach(function(blubb){
        if (blubb.route.path)
          if (blubb.route.path.startsWith('/') && blubb.route.path.length > 1) {
            ret.addAll([
              new rdf.Triple(
                  new rdf.NamedNode(''),
                  new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
                  new rdf.NamedNode(blubb.route.path.substring(1))),
              new rdf.Triple(
                  new rdf.NamedNode(''),
                  new rdf.NamedNode('http://example.org/hasSensorValue'),
                  new rdf.NamedNode(blubb.route.path.substring(1) + '#value'))
            ])
          }
    })
  response.sendGraph(ret);
});

var relayAppGraph = rdf.createGraph()
relayAppGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#BasicContainer')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('1')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('2'))
])

// current card 
var cards = new Object()

// last detected card
var lastCardTime = 0;

// triggers deletion from buffer
var timeout = setInterval(increaseAge, 100);

function increaseAge(force, except) {
    if (new Date() - lastCardTime >= 50 || force) {
        for (var key in cards) {
            if (cards.hasOwnProperty(key) && key != except) {
                cards[key] += 1;
                if (cards[key] > 3) {
                    delete cards[key];
                }
            }
        }
    }
}

rfid.on('ready', function(version) {
    console.log('Ready to read RFID card');
    rfid.on('data', function(card) {
        var cardId = card.uid.toString('hex');
        lastCardTime = (+new Date());
        cards[cardId] = 0;
        increaseAge(true, cardId)
    });
});

rfid.on('error', function(err) {
    console.error(err);
});


var cardPresentGraph = rdf.createGraph()
cardPresentGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode('#sensor'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/Sensor')),
  new rdf.Triple(
      new rdf.NamedNode('#sensor'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#value'),
      new rdf.Literal("true", null, "http://www.w3.org/2001/XMLSchema#boolean"))
])
var cardAbsentGraph = rdf.createGraph()
cardAbsentGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode('#sensor'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/Sensor')),
  new rdf.Triple(
      new rdf.NamedNode('#sensor'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#value'),
      new rdf.Literal("false", null, "http://www.w3.org/2001/XMLSchema#boolean"))
])
rfidApp.get('/', function(req, res) {
    if (Object.keys(cards).length > 0) {
      console.log(cardPresentGraph);
      res.sendGraph(cardPresentGraph);
    } else {
      console.log(cardAbsentGraph);
      res.sendGraph(cardAbsentGraph);
    }
});

// wiring the apps and routers
app.use("/leds", ledApp);

// description of the the leds
var ledRootGraph = rdf.createGraph();
ledRootGraph.addAll(
  [
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/Platform')),
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/isPrimaryTopicOf'),
      new rdf.NamedNode('')),
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('0#led')),
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('1#led')),
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('2#led')),
   new rdf.Triple(
      new rdf.NamedNode('#bar'),
      new rdf.NamedNode('http://www.w3.org/ns/sosa/hosts'),
      new rdf.NamedNode('3#led'))
  ])
ledApp.route('/')
  .all(redirectMissingTrailingSlash)
  .get(function(request, response) {
    response.sendGraph(ledRootGraph);
  })
  .delete(function(request, response){
    for (i = 0; i <= 3; i++) {
      tessel.led[i].off();
    }
    response.sendStatus(204);
  });

// GETting the state of one led
var ledBasicGraph = rdf.createGraph();
ledBasicGraph.addAll(
  [
    new rdf.Triple(
      new rdf.NamedNode('#led'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('https://w3id.org/saref#LightingDevice')),
   new rdf.Triple(
      new rdf.NamedNode('#led'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/isPrimaryTopicOf'),
      new rdf.NamedNode(''))
  ])
var onTriple = new rdf.Triple(
                      new rdf.NamedNode('#led'),
                      new rdf.NamedNode('https://w3id.org/saref#hasState'),
                      new rdf.NamedNode('https://w3id.org/saref#On'));
var offTriple = new rdf.Triple(
                      new rdf.NamedNode('#led'),
                      new rdf.NamedNode('https://w3id.org/saref#hasState'),
                      new rdf.NamedNode('https://w3id.org/saref#Off'));

var ledGraphOn = ledBasicGraph.merge([onTriple]);
var ledGraphOff = ledBasicGraph.merge([offTriple]);

ledApp.route("/:id").get(function(request, response) {

  id = Number(request.params.id);

  if (0 <= id && id <= 3) {
    var statetriple;

    if (tessel.led[id].isOn)
      response.sendGraph(ledGraphOn);
    else
      response.sendGraph(ledGraphOff);

  } else {
    response.sendStatus(404);
  }
});

// PUTting the state of one led
ledApp.route("/:id").put(function(request, response) {

  id = Number(request.params.id);

  if (0 <= id && id <= 3) {
      var targetStateTripleCount = 0;
      var statetriple;
      request.graph.filter(
        function(triple) {
          return triple.predicate.nominalValue === 'https://w3id.org/saref#hasState'
        }).forEach(function(triple) {
          ++targetStateTripleCount;
          statetriple = triple;
        })
      if (targetStateTripleCount === 0 || targetStateTripleCount > 1) {
          response.status(400);
          response.send('Please supply exactly one triple with desired state\n');
          return;
      }
      var targetState;

      if (statetriple.object.interfaceName === 'NamedNode') {
        switch (statetriple.object.nominalValue) {
          case "https://w3id.org/saref#On":
            targetState = true;
            break;
          case "https://w3id.org/saref#Off":
            targetState = false;
            break;
          default:
            response.status(400);
            response.send('Please supply a triple with saref:hasState as predicate and saref:Off or saref:On as object\n');
            return;
        }
      } else {
        response.status(400);
        response.send('Please supply a triple with saref:hasState as predicate and saref:Off or saref:On as object\n');
        return;
      }

      if (typeof targetState !== "boolean") {
        response.sendStatus(500);
      } else if (targetState !== tessel.led[id].isOn) {

        if (targetState === true)
          tessel.led[id].on();
        else
          tessel.led[id].off();
        response.sendStatus(204);
        return;
      }
      response.sendStatus(204);
      return;
  } else {
    response.sendStatus(404);
    return;
  }
});

// Startup the server
var port = 80;
app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});

// For finding the server in the network, some handy output on the console
console.log(require('os').networkInterfaces());

// error output for the ambient module
ambient.on('error', function (err) {
  console.log(err);
});

