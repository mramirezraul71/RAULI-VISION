// Package clima provee datos meteorológicos vía Open-Meteo (API gratuita, sin clave).
package clima

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"
)

// Current contiene los datos meteorológicos actuales.
type Current struct {
	Temperature   float64 `json:"temperature_2m"`
	ApparentTemp  float64 `json:"apparent_temperature"`
	Humidity      int     `json:"relative_humidity_2m"`
	WindSpeed     float64 `json:"wind_speed_10m"`
	WindDir       int     `json:"wind_direction_10m"`
	Precipitation float64 `json:"precipitation"`
	WeatherCode   int     `json:"weather_code"`
	IsDay         int     `json:"is_day"`
	Time          string  `json:"time"`
}

// DailyForecast es el pronóstico para un día.
type DailyForecast struct {
	Date        string  `json:"date"`
	TempMax     float64 `json:"temp_max"`
	TempMin     float64 `json:"temp_min"`
	PrecipSum   float64 `json:"precip_sum"`
	WeatherCode int     `json:"weather_code"`
}

// WeatherResponse es la respuesta completa del servicio.
type WeatherResponse struct {
	City      string          `json:"city"`
	Lat       float64         `json:"lat"`
	Lon       float64         `json:"lon"`
	Timezone  string          `json:"timezone"`
	Current   Current         `json:"current"`
	Daily     []DailyForecast `json:"daily"`
	FetchedAt string          `json:"fetched_at"`
}

type weatherCache struct {
	data      WeatherResponse
	expiresAt time.Time
}

// Service gestiona la obtención de datos meteorológicos.
type Service struct {
	client   *http.Client
	mu       sync.RWMutex
	cache    map[string]weatherCache
	cacheTTL time.Duration
}

// knownCities es un catálogo de ciudades con sus coordenadas predefinidas.
var knownCities = map[string][2]float64{
	"La Habana":        {23.1136, -82.3666},
	"Santiago de Cuba": {20.0247, -75.8219},
	"Camagüey":         {21.3797, -77.9170},
	"Holguín":          {20.8849, -76.2627},
	"Guantánamo":       {20.1448, -75.2119},
	"Matanzas":         {23.0411, -81.5775},
	"Santa Clara":      {22.4063, -79.9647},
	"Pinar del Río":    {22.4162, -83.6962},
	"Cienfuegos":       {22.1500, -80.4500},
	"Trinidad":         {21.8058, -79.9803},
	"Miami":            {25.7617, -80.1918},
	"Tampa":            {27.9506, -82.4572},
	"Madrid":           {40.4168, -3.7038},
	"Ciudad de México": {19.4326, -99.1332},
	"Caracas":          {10.4806, -66.9036},
	"Bogotá":           {4.7110, -74.0721},
	"Buenos Aires":     {-34.6037, -58.3816},
	"San José":         {9.9281, -84.0907},
}

// New crea un Service. Los datos se almacenan en caché durante 30 minutos.
func New() *Service {
	return &Service{
		client:   &http.Client{Timeout: 10 * time.Second},
		cache:    make(map[string]weatherCache),
		cacheTTL: 30 * time.Minute,
	}
}

// ListCities devuelve los nombres de ciudades disponibles, ordenados alfabéticamente.
func (s *Service) ListCities() []string {
	cities := make([]string, 0, len(knownCities))
	for name := range knownCities {
		cities = append(cities, name)
	}
	sort.Strings(cities)
	return cities
}

// FetchByCity obtiene el clima para una ciudad predefinida.
func (s *Service) FetchByCity(city string) (WeatherResponse, error) {
	coords, ok := knownCities[city]
	if !ok {
		return WeatherResponse{}, fmt.Errorf("ciudad no encontrada: %s", city)
	}
	return s.Fetch(coords[0], coords[1], city)
}

// Fetch obtiene el clima para coordenadas específicas.
func (s *Service) Fetch(lat, lon float64, cityName string) (WeatherResponse, error) {
	key := fmt.Sprintf("%.4f,%.4f", lat, lon)

	s.mu.RLock()
	if c, ok := s.cache[key]; ok && time.Now().Before(c.expiresAt) {
		s.mu.RUnlock()
		return c.data, nil
	}
	s.mu.RUnlock()

	apiURL := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast"+
			"?latitude=%.4f&longitude=%.4f"+
			"&current=temperature_2m,apparent_temperature,relative_humidity_2m,"+
			"wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day"+
			"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code"+
			"&timezone=auto&forecast_days=7",
		lat, lon,
	)

	resp, err := s.client.Get(apiURL)
	if err != nil {
		return WeatherResponse{}, fmt.Errorf("error conectando con Open-Meteo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return WeatherResponse{}, fmt.Errorf("Open-Meteo respondió HTTP %d", resp.StatusCode)
	}

	var raw struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Timezone  string  `json:"timezone"`
		Current   struct {
			Temperature   float64 `json:"temperature_2m"`
			ApparentTemp  float64 `json:"apparent_temperature"`
			Humidity      int     `json:"relative_humidity_2m"`
			WindSpeed     float64 `json:"wind_speed_10m"`
			WindDir       int     `json:"wind_direction_10m"`
			Precipitation float64 `json:"precipitation"`
			WeatherCode   int     `json:"weather_code"`
			IsDay         int     `json:"is_day"`
			Time          string  `json:"time"`
		} `json:"current"`
		Daily struct {
			Time        []string  `json:"time"`
			TempMax     []float64 `json:"temperature_2m_max"`
			TempMin     []float64 `json:"temperature_2m_min"`
			PrecipSum   []float64 `json:"precipitation_sum"`
			WeatherCode []int     `json:"weather_code"`
		} `json:"daily"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return WeatherResponse{}, fmt.Errorf("error decodificando respuesta: %w", err)
	}

	daily := make([]DailyForecast, 0, len(raw.Daily.Time))
	for i, date := range raw.Daily.Time {
		d := DailyForecast{Date: date}
		if i < len(raw.Daily.TempMax) {
			d.TempMax = raw.Daily.TempMax[i]
		}
		if i < len(raw.Daily.TempMin) {
			d.TempMin = raw.Daily.TempMin[i]
		}
		if i < len(raw.Daily.PrecipSum) {
			d.PrecipSum = raw.Daily.PrecipSum[i]
		}
		if i < len(raw.Daily.WeatherCode) {
			d.WeatherCode = raw.Daily.WeatherCode[i]
		}
		daily = append(daily, d)
	}

	result := WeatherResponse{
		City:     cityName,
		Lat:      raw.Latitude,
		Lon:      raw.Longitude,
		Timezone: raw.Timezone,
		Current: Current{
			Temperature:   raw.Current.Temperature,
			ApparentTemp:  raw.Current.ApparentTemp,
			Humidity:      raw.Current.Humidity,
			WindSpeed:     raw.Current.WindSpeed,
			WindDir:       raw.Current.WindDir,
			Precipitation: raw.Current.Precipitation,
			WeatherCode:   raw.Current.WeatherCode,
			IsDay:         raw.Current.IsDay,
			Time:          raw.Current.Time,
		},
		Daily:     daily,
		FetchedAt: time.Now().Format(time.RFC3339),
	}

	s.mu.Lock()
	s.cache[key] = weatherCache{data: result, expiresAt: time.Now().Add(s.cacheTTL)}
	s.mu.Unlock()

	return result, nil
}

// FetchByCityJSON devuelve el clima de una ciudad como JSON.
func (s *Service) FetchByCityJSON(city string) ([]byte, error) {
	data, err := s.FetchByCity(city)
	if err != nil {
		return nil, err
	}
	return json.Marshal(data)
}
