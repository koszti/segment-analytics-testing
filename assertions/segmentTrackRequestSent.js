const Ajv = require('ajv');
const msrv = require('./payload-schemas/merchant-search-results-viewed');

const ajv = new Ajv();

function getPayloadSchemaByEventName(eventName) {
  let schema;

  switch (eventName) {
    case 'Merchant Search Results Viewed': schema = msrv.getSchema(); break;
    default: throw new Error(`<${eventName}> payload cannot be validated because the schema is not implemented.`);
  }

  return schema;
}


exports.assertion = function (proxyApi, proxyPort, harPageRef, eventName, options = {}) {
  this.message = `Testing if segment API call sent <${eventName}>.`;
  this.expected = true;

  this.pass = value => value === this.expected;
  this.value = result => result;

  this.command = function (callback) {
    this.api.perform(() => {
      // Get the HAR file from BrowserMob that contains every network traffic log
      proxyApi.getHAR(proxyPort, (err, data) => {
        if (!err) {
          callback.call(this,

            // Search Segment API requests in  the HAR file
            JSON.parse(data).log.entries.filter((entry) => {
              let isEventInScope = false;

              // Find Segment track requests only on the required HAR page
              if (entry.pageref === harPageRef && entry.request.url.indexOf('api.segment.io/v1/t') > -1) {
                // Get the payload body of the HTTP POST Request
                const payload = JSON.parse(entry.request.postData.text);

                // Check if segment request is the one that we are looking after
                if (payload.event === eventName) {
                  // Validate the entire payload request against a JSON schema
                  if (options.validatePayload) {
                    if (ajv.validate(getPayloadSchemaByEventName(eventName), payload)) {
                      isEventInScope = true;
                    } else {
                      throw new Error(`Invalid payload body sent to Segment. ${ajv.errorsText()}\n${JSON.stringify(payload)}`);
                    }
                  } else {
                    isEventInScope = true;
                  }
                }
              }
              return isEventInScope;

            // Return as true if at least one segment track request found
            }).length > 0);
        } else {
          throw new Error(`Cannot get HAR file from BrowserMob Proxy: ${err}`);
        }
      });
    });

    return this;
  };
};
