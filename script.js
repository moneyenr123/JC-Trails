const mapContainer = document.getElementById("map-container");
const placeSearch = document.querySelector("gmp-place-search");
const placeSearchQuery = document.querySelector("gmp-place-text-search-request");
const detailsContainer = document.getElementById("details-container");
const placeDetails = document.querySelector("gmp-place-details-compact");
const placeRequest = document.querySelector("gmp-place-details-place-request");
const ratingFilter = document.getElementById("rating-filter");
const trailTypeFilter = document.getElementById("trail-type-filter");
const messageDisplay = document.getElementById("message-display");
const menuButton = document.getElementById("menu-button");
const sideNav = document.getElementById("side-nav");
const searchInput = document.getElementById('search-input');
const nearYouPopup = document.getElementById('near-you-popup');
const searchNearMeYes = document.getElementById('search-near-me-yes');
const searchNearMeNo = document.getElementById('search-near-me-no');

let markers = {};
let allPlaces = [];
let previousSearchQuery = '';
let gMap;
let placeDetailsPopup;
let routePolyline;
let AdvancedMarkerElement;
let LatLngBounds;
let LatLng;
let Route;
let currentUserPosition = null;
let unitSystem = 'METRIC'; // Default to Metric

function displayMessage(message, isError = false) {
    messageDisplay.textContent = message;
    messageDisplay.classList.remove('error');
    if (isError) {
        messageDisplay.classList.add('error');
        console.error(message);
    }
    messageDisplay.classList.add('show');
    setTimeout(() => {
        clearMessage();
    }, 5000);
}

function clearMessage() {
    messageDisplay.classList.remove('show');
    messageDisplay.textContent = '';
    messageDisplay.classList.remove('error');
}

async function init() {
    const { Map, Polyline } = await google.maps.importLibrary("maps");
    await google.maps.importLibrary("places");
    ({ AdvancedMarkerElement } = await google.maps.importLibrary("marker"));
    ({ LatLngBounds, LatLng } = await google.maps.importLibrary("core"));
    ({ Route } = await google.maps.importLibrary("routes"));

    setUnitSystem();

    let mapOptions = {
        center: { lat: 37.422, lng: -122.085 },
        zoom: 2,
        mapTypeControl: false,
        clickableIcons: false,
        mapId: 'DEMO_MAP_ID',
        renderingType: 'VECTOR'
    };

    gMap = new Map(mapContainer, mapOptions);

    placeDetailsPopup = new AdvancedMarkerElement({
        map: null,
        content: placeDetails,
        zIndex: 100
    });

    routePolyline = new Polyline({
        map: gMap,
        strokeColor: '#1A73E8',
        strokeOpacity: 0.8,
        strokeWeight: 5
    });

    findCurrentLocation();

    gMap.addListener('click', (e) => {
        hidePlaceDetailsPopup();
        if (sideNav.style.width === '250px') {
            closeNav();
        }
    });

    placeSearch.addEventListener("gmp-select", ({ place }) => {
        if (markers[place.id]) {
            markers[place.id].click();
        }
    });

    ratingFilter.addEventListener("change", filterMarkersByRating);
    trailTypeFilter.addEventListener("change", () => searchPlaces(true));
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            searchPlaces(false);
        }
    });

    const directionsButton = document.querySelector('.directions-button');
    directionsButton.addEventListener('click', getDirections);

    menuButton.addEventListener('click', toggleNav);

    searchNearMeYes.addEventListener('click', () => {
        searchInput.value = ''; // Clear text input for near me search
        searchPlaces(true); 
        nearYouPopup.style.display = 'none';
    });

    searchNearMeNo.addEventListener('click', () => {
        nearYouPopup.style.display = 'none';
    });
}

function setUnitSystem() {
    const locale = navigator.language;
    if (['en-US', 'en-GB', 'my', 'mm'].includes(locale)) {
        unitSystem = 'IMPERIAL';
    } else {
        unitSystem = 'METRIC';
    }
}

function toggleNav() {
    if (sideNav.style.width === '250px') {
        closeNav();
    } else {
        openNav();
    }
}

function openNav() {
    sideNav.style.width = '250px';
}

function closeNav() {
    sideNav.style.width = '0';
}

function searchPlaces(forceSearch = false) {
    const trailType = trailTypeFilter.value;
    const locationQuery = searchInput.value.trim();
    const fullQuery = `${trailType} ${locationQuery ? 'in ' + locationQuery : ''}`.trim();

    if (!forceSearch && fullQuery === previousSearchQuery) {
        return;
    }
    previousSearchQuery = fullQuery;
    hidePlaceDetailsPopup();
    clearMarkers();
    if (routePolyline) routePolyline.setPath([]);
    clearMessage();

    placeSearch.style.display = 'block';
    placeSearchQuery.textQuery = fullQuery;
    placeSearchQuery.locationBias = gMap.getBounds();
    placeSearch.addEventListener('gmp-load', () => {
        allPlaces = [...placeSearch.places];
        addMarkers();
    }, { once: true });
}

function addMarkers() {
    clearMarkers();
    const bounds = new LatLngBounds();
    const minRating = parseFloat(ratingFilter.value);

    const filteredPlaces = allPlaces.filter(place => !minRating || (place.rating && place.rating >= minRating));

    if (filteredPlaces.length > 0) {
        filteredPlaces.forEach((place) => {
            let marker = new AdvancedMarkerElement({
                map: gMap,
                position: place.location,
                title: place.displayName
            });

            marker.metadata = { id: place.id, place: place };
            markers[place.id] = marker;
            bounds.extend(place.location);

            marker.addListener('click', (event) => {
                placeRequest.place = place;
                placeDetails.style.display = 'block';
                placeDetailsPopup.position = place.location;
                placeDetailsPopup.map = gMap;
                gMap.fitBounds(place.viewport, { top: 200, left: 450 });
            });
        });
        if (!bounds.isEmpty()) {
            gMap.fitBounds(bounds);
        }
    } else {
        displayMessage('No trails found for the current filters.');
    }
}

function filterMarkersByRating() {
    addMarkers();
}

async function getDirections() {
    if (!placeDetails.place || !placeDetails.place.location) {
        displayMessage('No destination selected for directions.', true);
        return;
    }

    const destination = placeDetails.place.location;

    if (!currentUserPosition) {
        displayMessage('Could not get your current location for directions.', true);
        return;
    }

    try {
        const { routes } = await Route.computeRoutes({
            origin: currentUserPosition,
            destination: destination,
            travelMode: 'DRIVING',
            unitSystem: unitSystem,
            fields: ['path', 'localizedValues']
        });

        if (routes && routes.length > 0) {
            const route = routes[0];
            routePolyline.setPath(route.path.map(p => new LatLng(p.lat, p.lng)));
            const bounds = new LatLngBounds();
            bounds.extend(currentUserPosition);
            bounds.extend(destination);
            gMap.fitBounds(bounds, 100);
            const distance = route.localizedValues.distance.text;
            const duration = route.localizedValues.duration.text;
            displayMessage(`Directions: ${distance}, ${duration}`);
        } else {
            displayMessage('No routes found for the selected destination.', true);
        }
    } catch (error) {
        displayMessage('Error computing routes: ' + error.message, true);
        console.error('Error computing routes:', error);
    }
}

function clearMarkers() {
    for (const markerId in markers) {
        if (Object.prototype.hasOwnProperty.call(markers, markerId)) {
            markers[markerId].map = null;
        }
    }
    markers = {};
}

async function findCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentUserPosition = new LatLng(position.coords.latitude, position.coords.longitude);
                gMap.panTo(currentUserPosition);
                gMap.setZoom(12);
                nearYouPopup.style.display = 'flex';
            },
            (error) => {
                console.error('The Geolocation service failed:', error);
                displayMessage('Could not get your current location.', true);
            }
        );
    } else {
        console.error("Your browser doesn't support geolocation");
        displayMessage("Your browser doesn't support geolocation", true);
    }
}

function hidePlaceDetailsPopup() {
    if (placeDetailsPopup.map) {
        placeDetailsPopup.map = null;
        placeDetails.style.display = 'none';
        clearMessage();
    }
}

init();
