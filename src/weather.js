// Weather from Open-Meteo (free, no key), the same service Command Deck uses.

const CODES = [
  [[0], 'Clear', 'clear'], [[1], 'Mostly clear', 'clear'], [[2], 'Partly cloudy', 'partly'], [[3], 'Cloudy', 'cloud'],
  [[45, 48], 'Fog', 'fog'], [[51, 53, 55, 56, 57], 'Drizzle', 'rain'], [[61, 63, 65, 66, 67], 'Rain', 'rain'],
  [[71, 73, 75, 77], 'Snow', 'snow'], [[80, 81, 82], 'Showers', 'rain'], [[85, 86], 'Snow showers', 'snow'],
  [[95, 96, 99], 'Thunderstorm', 'storm']
];
function describe(code, isDay = true) {
  const hit = CODES.find(([list]) => list.includes(Number(code)));
  const text = hit ? hit[1] : 'Weather';
  let icon = hit ? hit[2] : 'cloud';
  if (!isDay && icon === 'clear') icon = 'moon';
  return { text, icon };
}

function forecastUrl({ lat, lon, unit = 'F' }) {
  return 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lon).toFixed(4)}`
    + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto'
    + (unit === 'C' ? '' : '&temperature_unit=fahrenheit');
}

async function fetchWeather(place, fetchFn) {
  const res = await fetchFn(forecastUrl(place));
  if (!res.ok) throw new Error('Weather service ' + res.status);
  const j = await res.json();
  const c = j.current || {};
  const d = describe(c.weather_code, c.is_day !== 0);
  return {
    temp: Math.round(c.temperature_2m), unit: place.unit === 'C' ? 'C' : 'F', text: d.text, icon: d.icon,
    high: j.daily ? Math.round(j.daily.temperature_2m_max[0]) : null,
    low: j.daily ? Math.round(j.daily.temperature_2m_min[0]) : null,
    place: place.name, at: Date.now()
  };
}

async function searchPlaces(q, fetchFn) {
  const res = await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  if (!res.ok) throw new Error('Place search ' + res.status);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    name: r.name, region: [r.admin1, r.country_code].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude
  }));
}

module.exports = { describe, forecastUrl, fetchWeather, searchPlaces };
