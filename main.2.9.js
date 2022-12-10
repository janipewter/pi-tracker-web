//Assign things to gpsTracker to make them available outside of this script without cluttering up the global scope.
const gpsTracker = {};

(function () {
    const startingCoords = [50.3660837693773, -4.147872776193754];
    const mapStatusEle = document.getElementById('map-status');
    const mapStatusTextEle = document.getElementById('map-status-text');
    const mapStatusLastUpdatedEle = document.getElementById('map-status-last-updated');
    const mapStatusCoordsEle = document.getElementById('map-status-coords');
    const mapCanvas = document.getElementById('map-canvas');
    const pnChannel = 'drifter-tracker';
    const pubnub = new PubNub({
        subscribeKey: 'sub-c-b5450a2c-3f3b-491d-9d29-260ec735fcc5'
    });
    const secondsToConsiderStale = 5; // 300 seconds = 5 minutes
    const maxSecondsSinceLastMessage = 86400000; // 86400000 = 24 hours
    let map, mark, lineCoords = [];
    gpsTracker.lastPnMessage = null;
    gpsTracker.staleCheckTimeoutId = null;

    const dateFormat = (dateObject, format = 'yyyy-mm-dd hh:ii:ss') => {
        const year = dateObject.getFullYear();
        const month = dateObject.getMonth()+1;
        const day = dateObject.getDate();
        const hours = dateObject.getHours();
        const minutes = dateObject.getMinutes();
        const seconds = dateObject.getSeconds();

        return format
            .replace('dd', day.toString().padStart(2, "0"))
            .replace('mm', month.toString().padStart(2, "0"))
            .replace('yyyy', year.toString())
            .replace('hh', hours.toString().padStart(2, "0"))
            .replace('ii', minutes.toString().padStart(2, "0"))
            .replace('ss', seconds.toString().padStart(2, "0"));
    };

    const staleCheckHandler = () => {
        updateMapStatus(gpsTracker.lastPnMessage);
    };

    const timetokenIsStale = timetoken =>
        ((new Date().getTime() / 1e3) - (timetoken / 1e7)) >= secondsToConsiderStale;

    /**
     * Redraw map lines and re-center view
     * @param payload
     */
    const redraw = payload => {
        updateMapStatus(payload);
        if(payload.message.lat){
            map.setCenter({lat:payload.message.lat, lng:payload.message.lng, alt:0});
            mark.setPosition({lat:payload.message.lat, lng:payload.message.lng, alt:0});

            lineCoords.push(new google.maps.LatLng(payload.message.lat, payload.message.lng));

            const lineCoordinatesPath = new google.maps.Polyline({
                path: lineCoords,
                geodesic: true,
                strokeColor: '#2E10FF'
            });

            lineCoordinatesPath.setMap(map);
        }
    };

    const updateMapStatus = pnMessage => {
        if (gpsTracker.staleCheckTimeoutId !== null) {
            clearTimeout(gpsTracker.staleCheckTimeoutId);
            gpsTracker.staleCheckTimeoutId = null;
        }

        let status = 'unknown';
        if (typeof pnMessage === 'undefined') {
            status = 'unknown';
        } else if (pnMessage === gpsTracker.lastPnMessage || gpsTracker.lastPnMessage === null) {
            if (timetokenIsStale(pnMessage.timetoken)) {
                status = 'stale';
            } else {
                status = 'active';
            }
        } else {
            status = 'active';
        }

        mapStatusTextEle.innerText = 'UNKNOWN';
        mapStatusTextEle.classList = '';
        mapStatusLastUpdatedEle.innerText = '';
        mapStatusCoordsEle.innerText = '';

        switch (status) {
            case 'stale':
                mapStatusTextEle.innerText = 'DATA STALE';
                mapStatusEle.classList = 'map-status-has-stale';
                mapStatusCoordsEle.innerText = 'last position: ' + pnMessage.message.lat + ', ' + pnMessage.message.lng;
                mapStatusLastUpdatedEle.innerText = 'received at: ' + dateFormat(new Date(pnMessage.timetoken/1e4));
                break;
            case 'active':
                mapStatusTextEle.innerText = 'TRACKING ACTIVE';
                mapStatusEle.classList = 'map-status-has-active';
                mapStatusCoordsEle.innerText = 'last position: ' + pnMessage.message.lat + ', ' + pnMessage.message.lng;
                mapStatusLastUpdatedEle.innerText = 'received at: ' + dateFormat(new Date(pnMessage.timetoken/1e4));
                gpsTracker.staleCheckTimeoutId = setTimeout(staleCheckHandler, secondsToConsiderStale * 1e3);
                break;
            default:
                mapStatusTextEle.innerText = 'UNKNOWN STATUS';
                mapStatusEle.classList = 'map-status-has-stale';
        }

        gpsTracker.lastPnMessage = pnMessage;
    };

    /**
     * Init for googleMaps callback
     */
    window.initMap = () => {
        map = new google.maps.Map(mapCanvas, {center:{lat:startingCoords[0],lng:startingCoords[1]},zoom:15});
        mark = new google.maps.Marker({position:{lat:startingCoords[0], lng:startingCoords[1]}, map:map});

        pubnub.subscribe({channels: [pnChannel]});
        pubnub.addListener({message:redraw});
    };

    const nowTime = new Date().getTime();
    pubnub.fetchMessages(
        {
            channels: [pnChannel],
            end: (nowTime - (maxSecondsSinceLastMessage*1e3))*1e4,
            count: 1
        },
        (status, response) => {
            if (typeof response.channels[pnChannel] !== 'undefined') {
                if (response.channels[pnChannel].length) {
                    updateMapStatus(response.channels[pnChannel][0]);
                    startingCoords[0] = response.channels[pnChannel][0].message.lat;
                    startingCoords[1] = response.channels[pnChannel][0].message.lng;
                    map.setCenter({lat:startingCoords[0], lng:startingCoords[1], alt:0});
                    mark.setPosition({lat:startingCoords[0], lng:startingCoords[1], alt:0});
                }
            }
        }
    );
})();