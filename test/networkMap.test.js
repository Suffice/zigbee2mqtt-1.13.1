const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const stringify = require('json-stable-stringify-without-jsonify');
const fs = require('fs');
const path = require('path');
const {coordinator, bulb, bulb_color, WXKG02LM_rev1, CC2530_ROUTER, unsupported_router, external_converter_device} = zigbeeHerdsman.devices;

zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb_color.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG02LM_rev1.ieeeAddr);
zigbeeHerdsman.returnDevices.push(CC2530_ROUTER.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported_router.ieeeAddr);
zigbeeHerdsman.returnDevices.push(external_converter_device.ieeeAddr);
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = require('./lib/flushPromises');
const mocksClear = [MQTT.publish, logger.warning, logger.debug];
const setTimeoutNative = setTimeout;

describe('Networkmap', () => {
    let controller;

    beforeAll(async () => {
        jest.useFakeTimers();
        Date.now = jest.fn();
        Date.now.mockReturnValue(10000);
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeEmptyState();
        fs.copyFileSync(path.join(__dirname, 'assets', 'mock-external-converter.js'), path.join(data.mockDir, 'mock-external-converter.js'));
        settings.set(['external_converters'], ['mock-external-converter.js']);
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
    });

    beforeEach(async () => {
        mocksClear.forEach((m) => m.mockClear());
        await flushPromises();
        const device = zigbeeHerdsman.devices.bulb_color;
        device.lastSeen = 1000;
        external_converter_device.lastSeen = 1000;
        global.setTimeout = (r) => r();
    });

    afterEach(async () => {
        global.setTimeout = setTimeoutNative;
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    function mock() {
        /**
         * Topology
         *             | -> external_device
         *             | -> bulb_color -> unsupported_router (offline)
         * coordinator |      ^     ^
         *             |      |     | (not valid)
         *             | -> bulb    |
         *                    |  -> CC2530_ROUTER -> WXKG02LM_rev1
         *
         */
        coordinator.lqi = jest.fn().mockResolvedValue({
            neighbors: [
                {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 2, depth: 1, linkquality: 120},
                {ieeeAddr: bulb.ieeeAddr, networkAddress: bulb.networkAddress, relationship: 2, depth: 1, linkquality: 92},
                {
                    ieeeAddr: external_converter_device.ieeeAddr,
                    networkAddress: external_converter_device.networkAddress,
                    relationship: 2,
                    depth: 1,
                    linkquality: 92,
                },
            ],
        });
        coordinator.routingTable = jest.fn().mockResolvedValue({
            table: [{destinationAddress: CC2530_ROUTER.networkAddress, status: 'ACTIVE', nextHop: bulb.networkAddress}],
        });
        bulb.lqi = jest.fn().mockResolvedValue({
            neighbors: [
                {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 1, depth: 2, linkquality: 110},
                {ieeeAddr: CC2530_ROUTER.ieeeAddr, networkAddress: CC2530_ROUTER.networkAddress, relationship: 1, depth: 2, linkquality: 100},
            ],
        });
        bulb.routingTable = jest.fn().mockResolvedValue({table: []});
        bulb_color.lqi = jest.fn().mockResolvedValue({neighbors: []});
        bulb_color.routingTable = jest.fn().mockResolvedValue({table: []});
        CC2530_ROUTER.lqi = jest.fn().mockResolvedValue({
            neighbors: [
                {ieeeAddr: '0x0000000000000000', networkAddress: WXKG02LM_rev1.networkAddress, relationship: 1, depth: 2, linkquality: 130},
                {ieeeAddr: bulb_color.ieeeAddr, networkAddress: bulb_color.networkAddress, relationship: 4, depth: 2, linkquality: 130},
            ],
        });
        CC2530_ROUTER.routingTable = jest.fn().mockResolvedValue({table: []});
        unsupported_router.lqi = jest.fn().mockRejectedValue(new Error('failed'));
        unsupported_router.routingTable = jest.fn().mockRejectedValue(new Error('failed'));
    }

    it('Should output raw networkmap', async () => {
        mock();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 110,
                            lqi: 110,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            targetIeeeAddr: '0x000b57fffec6a5b2',
                        },
                        {
                            depth: 2,
                            linkquality: 100,
                            lqi: 100,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            sourceIeeeAddr: '0x0017880104e45559',
                            sourceNwkAddr: 6540,
                            target: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            targetIeeeAddr: '0x000b57fffec6a5b2',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            // definition: null,
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            modelID: null,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm',
                                model: 'LED1545G12',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, level_config), effect, power_on_behavior, color_options, identify, linkquality',
                                vendor: 'IKEA',
                            },
                            failed: [],
                            friendlyName: 'bulb',
                            ieeeAddr: '0x000b57fffec6a5b2',
                            lastSeen: 1000,
                            modelID: 'TRADFRI bulb E27 WS opal 980lm',
                            networkAddress: 40369,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(call[1]);
        expect(actual).toStrictEqual(expected);
    });

    it('Should throw error when requesting invalid type', async () => {
        mock();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', 'not_existing');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/networkmap',
            stringify({data: {}, status: 'error', error: "Type 'not_existing' not supported, allowed are: raw,graphviz,plantuml"}),
            {retain: false, qos: 0},
            expect.any(Function),
        );
    });

    it('Should exclude disabled devices from networkmap', async () => {
        settings.set(['devices', '0x000b57fffec6a5b2', 'disabled'], true);
        mock();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            // definition: null,
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            modelID: null,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(call[1]);
        expect(actual).toStrictEqual(expected);
    });

    it('Handles retrying request when first attempt fails', async () => {
        settings.set(['devices', '0x000b57fffec6a5b2', 'disabled'], true);
        mock();
        bulb.lqi.mockRejectedValueOnce(new Error('failed'));
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/networkmap', stringify({type: 'raw', routes: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        let call = MQTT.publish.mock.calls[0];
        expect(call[0]).toStrictEqual('zigbee2mqtt/bridge/response/networkmap');

        const expected = {
            data: {
                routes: true,
                type: 'raw',
                value: {
                    links: [
                        {
                            depth: 1,
                            linkquality: 120,
                            lqi: 120,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x000b57fffec6a5b3', networkAddress: 40399},
                            sourceIeeeAddr: '0x000b57fffec6a5b3',
                            sourceNwkAddr: 40399,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [{destinationAddress: 6540, nextHop: 40369, status: 'ACTIVE'}],
                            source: {ieeeAddr: '0x000b57fffec6a5b2', networkAddress: 40369},
                            sourceIeeeAddr: '0x000b57fffec6a5b2',
                            sourceNwkAddr: 40369,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 1,
                            linkquality: 92,
                            lqi: 92,
                            relationship: 2,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45511', networkAddress: 1114},
                            sourceIeeeAddr: '0x0017880104e45511',
                            sourceNwkAddr: 1114,
                            target: {ieeeAddr: '0x00124b00120144ae', networkAddress: 0},
                            targetIeeeAddr: '0x00124b00120144ae',
                        },
                        {
                            depth: 2,
                            linkquality: 130,
                            lqi: 130,
                            relationship: 1,
                            routes: [],
                            source: {ieeeAddr: '0x0017880104e45521', networkAddress: 6538},
                            sourceIeeeAddr: '0x0017880104e45521',
                            sourceNwkAddr: 6538,
                            target: {ieeeAddr: '0x0017880104e45559', networkAddress: 6540},
                            targetIeeeAddr: '0x0017880104e45559',
                        },
                    ],
                    nodes: [
                        {
                            // definition: null,
                            failed: [],
                            friendlyName: 'Coordinator',
                            ieeeAddr: '0x00124b00120144ae',
                            lastSeen: 1000,
                            modelID: null,
                            networkAddress: 0,
                            type: 'Coordinator',
                        },
                        {
                            definition: {
                                description: 'Hue Go',
                                model: '7146060PH',
                                supports:
                                    'light (state, brightness, color_temp, color_temp_startup, color_xy, color_hs), power_on_behavior, effect, linkquality',
                                vendor: 'Philips',
                            },
                            failed: [],
                            friendlyName: 'bulb_color',
                            ieeeAddr: '0x000b57fffec6a5b3',
                            lastSeen: 1000,
                            modelID: 'LLC020',
                            networkAddress: 40399,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'Wireless remote switch (double rocker), 2016 model',
                                model: 'WXKG02LM_rev1',
                                supports: 'battery, voltage, power_outage_count, action, linkquality',
                                vendor: 'Aqara',
                            },
                            friendlyName: 'button_double_key',
                            ieeeAddr: '0x0017880104e45521',
                            lastSeen: 1000,
                            modelID: 'lumi.sensor_86sw2.es1',
                            networkAddress: 6538,
                            type: 'EndDevice',
                        },
                        {
                            definition: {
                                description: 'Automatically generated definition',
                                model: 'notSupportedModelID',
                                supports: 'action, linkquality',
                                vendor: 'Boef',
                            },
                            failed: ['lqi', 'routingTable'],
                            friendlyName: '0x0017880104e45525',
                            ieeeAddr: '0x0017880104e45525',
                            lastSeen: 1000,
                            manufacturerName: 'Boef',
                            modelID: 'notSupportedModelID',
                            networkAddress: 6536,
                            type: 'Router',
                        },
                        {
                            definition: {
                                description: 'CC2530 router',
                                model: 'CC2530.ROUTER',
                                supports: 'led, linkquality',
                                vendor: 'Custom devices (DiY)',
                            },
                            failed: [],
                            friendlyName: 'cc2530_router',
                            ieeeAddr: '0x0017880104e45559',
                            lastSeen: 1000,
                            modelID: 'lumi.router',
                            networkAddress: 6540,
                            type: 'Router',
                        },
                        {
                            definition: {description: 'external', model: 'external_converter_device', supports: 'linkquality', vendor: 'external'},
                            friendlyName: '0x0017880104e45511',
                            ieeeAddr: '0x0017880104e45511',
                            lastSeen: 1000,
                            modelID: 'external_converter_device',
                            networkAddress: 1114,
                            type: 'EndDevice',
                        },
                    ],
                },
            },
            status: 'ok',
        };
        const actual = JSON.parse(call[1]);
        expect(actual).toStrictEqual(expected);
    });
});
