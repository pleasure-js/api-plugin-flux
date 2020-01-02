/*!
 * @pleasure-js/api-plugin-flux v1.0.0-beta
 * (c) 2018-2020 Martin Rafael Gonzalez <tin@devtin.io>
 * Released under the MIT License.
 */
import castArray from 'lodash/castArray';
import forOwn from 'lodash/forOwn';
import defaultsDeep from 'lodash/defaultsDeep';
import { getConfig } from '@pleasure-js/utils';
import { updatedDiff } from 'deep-object-diff';

const { debug } = getConfig();

let io;
let PleasureEntityMap;
let getUserGroups;

/**
 * @typedef {Object} FluxConfig
 * @property {Function} getDeliveryGroup - Function called with the JWT user in session (if any, null otherwise)
 * that must resolve a {String} indicating the delivery group for the flux-pattern functionality. If none present will
 * default to `(auth) => { auth.level  || 'global' }`
 * @property {Object} payload - Holds all of the payload hooks
 * @property {Function} payload.create - Hook
 * @property {Function} payload.update - Hook
 * @property {Function} payload.delete - Hook
 */

/**
 *
 * @param {String} entityName
 * @param {String} method
 * @param {Object} payload - Submitted for approval
 * @param {Object} [legacy] - Payload that will be merged with approved one to be send.
 */
function fluxDelivery (entityName, method, payload, legacy) {
  if (!method || (!payload && !legacy)) {
    return
  }

  if (!PleasureEntityMap) {
    debug && console.log(`trying to emit flux with no API initialized`);
    return
  }

  let deliveryGroup = PleasureEntityMap[entityName].flux.access[method](payload);

  const getDeliveryPayload = group => {
    let deliveryPayload = PleasureEntityMap[entityName].flux.payload[method](Object.assign({ group }, payload));

    if (!deliveryPayload) {
      return
    }

    deliveryPayload = Array.isArray(deliveryPayload) || !(typeof deliveryPayload === 'object' && 'toObject' in deliveryPayload) ? deliveryPayload : deliveryPayload.toObject();

    return [method, Object.assign({ entry: deliveryPayload, entity: entityName }, legacy || {})]
  };

  if (!deliveryGroup) {
    return
  }

  if (typeof deliveryGroup === 'boolean') {
    deliveryGroup = '$global';
  }

  if (debug) {
    io.in('$global').clients((err, clients) => {
      if (err) {
        return console.log(`error getting clients in $global`, err)
      }
    });
  }

  castArray(deliveryGroup).forEach(group => {
    const payload = getDeliveryPayload(group);
    if (payload) {
      try {
        io.to(group).emit(...payload);
        debug && console.log(`deliver ${ method } > ${ group }`, { payload });
        // .map(s => s.id)
        /*
                io.in(group).clients((err, clients) => {
                  if (err) {
                    debug && console.log(`error getting clients in ${ group }`, err)
                  }
                  debug && console.log(`${ clients.length } in ${ group }`, clients)
                })
        */
      } catch (err) {
        debug && console.log(`Error delivering flux`, err);
      }
    }
  });
}

var apiPluginFlux = {
  config: {
    access: {
      /**
       * @callback Entity#flux#access#create
       * @param entry - The mongoose entry
       *
       * Called every time an entry that belongs to the entity is created. Must return an array indicating the
       * group of clients that should get notified. `true` for all, `false` for none. Defaults to `true`.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      create ({ entry }) {
        return ['admin']
      },
      /**
       * @callback Entity#flux#access#update
       * @param entry - The mongoose entry
       * @param entry.$before - The state of the entry before the update
       * @param entry.$after - The state of the entry after the update
       *
       * Called every time an entry that belongs to the entity is updated. Must return an array indicating the
       * group of clients that should get notified. `true` for all, `false` for none.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      update ({ entry }) {
        return ['admin']
      },
      /**
       * @callback Entity#flux#access#delete
       * @param {Object} entry - The mongoose entry being deleted
       *
       * Called every time an entry that belongs to the entity is deleted. Must return an array indicating the
       * group of clients that should get notified. `true` for all, `false` for none.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      delete ({ entry }) {
        return ['admin']
      },
      /**
       * @callback Entity#flux#access#updateMany
       * @param {Object[]} entries - Array with the entries being updated
       *
       * Called every time a bulk update is performed, e.g.
       * `pleasureClient.update('product', ['id1', 'id2'], {...})`.
       *
       * Must return an array indicating the group of clients that should get notified. `true` for all, `false`
       * for none.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      updateMany ({ entries }) {
        return ['admin']
      },
      /**
       * @callback Entity#flux#access#deleteMany
       * @param {Object[]} entries - Array with the entries being deleted
       *
       * Called every time a bulk delete is performed, e.g:
       * `pleasureClient.remove('product', ['id1', 'id2'], {...})`.
       *
       * deleted. Must return an array indicating the group of clients that should get notified. `true` for all, `false`
       * for none.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      deleteMany ({ entries }) {
        return ['admin']
      }
    },
    payload: {
      /**
       * @callback Entity#flux#payload#create
       * @param {String} group - Group where the payload is gonna be transmitted to
       * @param {Object} entry - The entry being created.
       *
       * Called every time an entry is created.
       * Must return the payload `Object` to be delivered or `falsy` to deliver nothing.
       *
       * @return {Object} - The payload that must be return to the `group`.
       */
      create ({ group, entry }) {
        return entry
      },
      /**
       * @callback Entity#flux#payload#update
       * @param {String} group - Group where the payload is gonna be transmitted to
       * @param {Object} entry - The entry being created.
       *
       * Called every time an entry is updated.
       * Must return the payload `Object` to be delivered or `falsy` to deliver nothing.
       *
       * @return {Object} - The payload that must be return to the `group`.
       */
      update ({ entry }) {
        return entry
      },
      /**
       * @callback Entity#flux#payload#delete
       * @param {String} group - Group where the payload is gonna be transmitted to
       * @param {Object} entry - The entry being created.
       *
       * Called every time an entry is deleted.
       * Must return the payload `Object` to be delivered or `falsy` to deliver nothing.
       *
       * @return {Object} - The payload that must be return to the `group`.
       */
      delete ({ entry }) {
        return entry
      },
      /**
       * @callback Entity#flux#payload#updateMany
       * @param {Object[]} entries - Array with the entries being updated
       *
       * Called every time a bulk update is performed, e.g.
       * `pleasureClient.update('product', ['id1', 'id2'], {...})`.
       *
       * Must return the payload `Object` (or `Array`) to be delivered. Anything `falsy` to deliver nothing.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      updateMany ({ entries }) {
        return false
      },
      /**
       * @callback Entity#flux#access#deleteMany
       * @param {Object[]} entries - Array with the entries being deleted
       *
       * Called every time a bulk delete is performed, for example, by using the  that belongs to the entity is
       * deleted. Must return an array indicating the group of clients that should get notified. `true` for all, `false`
       * for none.
       *
       * @return {String[]|Boolean} - Defaults to `['admin']`
       */
      deleteMany ({ entries }) {
        return false
      }
    }
  },
  name: 'flux',
  prepare ({ pleasureEntityMap, pluginsApi, config }) {
    PleasureEntityMap = pleasureEntityMap;
    io = pluginsApi.io.socketIo();
    getUserGroups = pluginsApi.io.getUserGroups;

    forOwn(pleasureEntityMap, (entity, entityName) => {
      defaultsDeep(entity, { flux: config });
    });
  },
  schemaCreated ({ entityName, mongooseSchema }) {
    mongooseSchema.post('init', function (entry) {
      entry.$before = entry.toObject();
    });

    const entryDelivery = (method, entry, legacy) => {
      if (entry && entry.$noFLux) {
        return
      }

      // console.log({ legacy })
      return fluxDelivery(entityName, method, { entry }, legacy)
    };

    mongooseSchema.post('save', function (entry) {
      entry.$after = entry.toObject();
      const method = entry.wasNew && !entry._fluxWasNew ? 'create' : 'update';
      const legacy = {};
      if (entry.wasNew) {
        entry._fluxWasNew = true;
      } else {
        Object.assign(legacy, { modified: updatedDiff(entry.$before, entry.$after), id: entry._id });
      }
      entryDelivery(method, entry, legacy);
      // entry.wasNew = false // reset was new
    });

    mongooseSchema.post('remove', {
      query: true,
      document: true
    }, entry => {
      entryDelivery('delete', entry, { id: entry._id });
    });

    mongooseSchema.post('deleteMany', {
      query: true,
      document: true
    }, (entries) => {
      // console.log({ entries })
      entryDelivery('deleteMany', entries/*, { ids: entries.map(({ _id }) => _id) }*/);
    });

    mongooseSchema.post('updateMany', {
      query: true,
      document: true
    }, (entries) => {
      entryDelivery('updateMany', entries/*, { ids: entries.map(({ _id }) => _id) }*/);
    });
  },
  methods: {
    fluxDelivery
  }
};

export default apiPluginFlux;
