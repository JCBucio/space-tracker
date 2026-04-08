import React, { useState, useEffect, useRef } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const GlobeTracker = () => {
    const globeRef = useRef();
    const [stations, setStations] = useState([]);
    const [trajectories, setTrajectories] = useState([]);
    const [modelsReady, setModelsReady] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [selectedStationName, setSelectedStationName] = useState('');
    const [stationInfoCache, setStationInfoCache] = useState({
        iss: null,
        css: null,
    });
    const [stationInfoLoading, setStationInfoLoading] = useState(false);
    const [stationInfoError, setStationInfoError] = useState('');
    const [expeditionData, setExpeditionData] = useState(null);
    const [expeditionLoading, setExpeditionLoading] = useState(false);
    const expeditionCacheRef = useRef({});
    const lastTrajectoryUpdateRef = useRef(0);
    const modelTemplatesRef = useRef({
        iss: null,
        css: null,
    });
    const modelInstancesRef = useRef({});

    // Load 3D models once (ISS and CSS)
    useEffect(() => {
        const loader = new GLTFLoader();

        const loadModel = (path) =>
            new Promise((resolve, reject) => {
                loader.load(path, resolve, undefined, reject);
            });

        Promise.all([
            loadModel('/models/iss.glb'),
            loadModel('/models/tiangong_1.glb')
        ])
            .then(([issGltf, cssGltf]) => {
                // Configure ISS model
                issGltf.scene.scale.set(2.5, 2.5, 2.5);
                issGltf.scene.rotation.x = Math.PI / 2;

                // Configure CSS model
                cssGltf.scene.scale.set(0.1, 0.1, 0.1);
                cssGltf.scene.rotation.x = Math.PI / 2;

                modelTemplatesRef.current = {
                    iss: issGltf.scene,
                    css: cssGltf.scene,
                };
                setModelsReady(true);
            })
            .catch((error) => {
                console.error('Error loading 3D models:', error);
            });

    }, []);

    const getTemplateByStationName = (name = '') => {
        if (name.includes('ISS')) return modelTemplatesRef.current.iss;
        if (name.includes('CSS') || name.includes('TIANHE')) return modelTemplatesRef.current.css;
        return null;
    };

    const getOrCreateStationModel = (stationName) => {
        const existing = modelInstancesRef.current[stationName];
        if (existing) return existing;

        const template = getTemplateByStationName(stationName);
        if (!template) return new THREE.Object3D();

        const instance = template.clone(true);
        modelInstancesRef.current[stationName] = instance;
        return instance;
    };

    const getStationColor = (name = '') => {
        if (name.includes('ISS')) return '#00E5FF';
        if (name.includes('CSS') || name.includes('TIANHE')) return '#FF4D6D';
        return '#FFFFFF';
    };

    const getStationTypeByName = (name = '') => {
        if (name.includes('ISS')) return 'iss';
        if (name.includes('CSS') || name.includes('TIANHE')) return 'css';
        return null;
    };

    const focusStation = (station) => {
        if (!globeRef.current || !station) return;

        globeRef.current.pointOfView(
            {
                lat: station.lat,
                lng: station.lng,
                altitude: 2,
            },
            1200
        );
    };

    const loadStationInfo = async (stationName) => {
        const stationType = getStationTypeByName(stationName);
        if (!stationType) return;

        if (stationInfoCache[stationType]) return;

        const endpoint = stationType === 'iss'
            ? 'http://localhost:3001/api/iss-info'
            : 'http://localhost:3001/api/css-info';

        try {
            setStationInfoError('');
            setStationInfoLoading(true);

            const response = await fetch(endpoint);
            const data = await response.json();

            setStationInfoCache(prev => ({
                ...prev,
                [stationType]: data,
            }));
        } catch (error) {
            console.error('Error loading station info:', error);
            setStationInfoError('Could not load station information.');
        } finally {
            setStationInfoLoading(false);
        }
    };

    const loadExpeditionData = async (expeditionId) => {
        if (!expeditionId) return;

        if (expeditionCacheRef.current[expeditionId]) {
            setExpeditionData(expeditionCacheRef.current[expeditionId]);
            return;
        }

        try {
            setExpeditionLoading(true);
            const response = await fetch(`http://localhost:3001/api/expedition/${expeditionId}`);
            const data = await response.json();

            expeditionCacheRef.current[expeditionId] = data;
            setExpeditionData(data);
        } catch (error) {
            console.error('Error loading expedition data:', error);
            setExpeditionData(null);
        } finally {
            setExpeditionLoading(false);
        }
    };

    const handleSelectStation = (station) => {
        setSelectedStationName(station.name);
        focusStation(station);
        loadStationInfo(station.name);
    };

    const buildNextOrbitTrajectory = (station, startDate = new Date()) => {
        // satrec.no is mean motion in radians/minute
        const meanMotionRadPerMin = station.satrec?.no;
        const defaultOrbitMinutes = 92;
        const orbitMinutes = meanMotionRadPerMin > 0
            ? (2 * Math.PI) / meanMotionRadPerMin
            : defaultOrbitMinutes;

        const samples = 120;
        const orbitMs = orbitMinutes * 60 * 1000;
        const points = [];

        for (let i = 0; i <= samples; i += 1) {
            const stepTime = new Date(startDate.getTime() + (orbitMs * i) / samples);
            const pv = satellite.propagate(station.satrec, stepTime);
            const posEci = pv.position;
            if (!posEci) continue;

            const gmst = satellite.gstime(stepTime);
            const posGd = satellite.eciToGeodetic(posEci, gmst);

            points.push({
                lat: satellite.degreesLat(posGd.latitude),
                lng: satellite.degreesLong(posGd.longitude),
                alt: (posGd.height / 6371) * 1.5,
            });
        }

        return {
            name: station.name,
            color: getStationColor(station.name),
            points,
        };
    };

    // Fetch data from the API
    useEffect(() => {
        let intervalId;

        const fetchStations = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/tles');
                const tlesData = await res.json();

                // Maths of satellite position calculation
                const satrecs = tlesData.map(station => ({
                    ...station,
                    satrec: satellite.twoline2satrec(station.tle1, station.tle2)
                }));

                // Build first trajectory set right away
                setTrajectories(
                    satrecs
                        .map(station => buildNextOrbitTrajectory(station, new Date()))
                        .filter(trajectory => trajectory.points.length > 1)
                );
                lastTrajectoryUpdateRef.current = Date.now();

                // Update station positions every second
                intervalId = setInterval(() => {
                    const currentDate = new Date();

                    const currentPositions = satrecs.map(station => {
                        const positionAndVelocity = satellite.propagate(station.satrec, currentDate);
                        const positionEci = positionAndVelocity.position;

                        // If there is an error in propagation, skip this station
                        if (!positionEci) return null;

                        const gmst = satellite.gstime(currentDate);
                        const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                        return {
                            name: station.name,
                            lat: satellite.degreesLat(positionGd.latitude),
                            lng: satellite.degreesLong(positionGd.longitude),
                            alt: positionGd.height / 6371 * 1.5, // Scale altitude for better visualization
                        };

                    }).filter(Boolean); // Remove null entries

                    setStations(currentPositions);

                    // Rebuild "next orbit" trajectories every 30s (lightweight and smooth)
                    if (Date.now() - lastTrajectoryUpdateRef.current > 30000) {
                        setTrajectories(
                            satrecs
                                .map(station => buildNextOrbitTrajectory(station, currentDate))
                                .filter(trajectory => trajectory.points.length > 1)
                        );
                        lastTrajectoryUpdateRef.current = Date.now();
                    }
                }, 3000);
            } catch (error) {
                console.error('Error fetching TLE data:', error);
            }
        };

        fetchStations();

        return () => clearInterval(intervalId);
    }, []);

    const selectedStation = stations.find(s => s.name === selectedStationName) || null;
    const selectedStationType = getStationTypeByName(selectedStationName);
    const selectedStationInfo = selectedStationType ? stationInfoCache[selectedStationType] : null;
    const stationOwners = selectedStationInfo?.owners?.map(owner => owner.abbrev || owner.name) || [];
    const activeExpeditionId = selectedStationInfo?.active_expeditions?.[0]?.id;
    const activeExpeditionName = selectedStationInfo?.active_expeditions?.[0]?.name;
    const stationLogo = selectedStationInfo?.image?.thumbnail_url;

    // Fetch expedition data when expedition ID changes
    useEffect(() => {
        if (activeExpeditionId) {
            loadExpeditionData(activeExpeditionId);
        }
    }, [activeExpeditionId]);

    return (
        <div className="tracker-layout" style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }}>
            <aside className={`station-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <button
                    className="sidebar-toggle"
                    type="button"
                    onClick={() => setIsSidebarCollapsed(prev => !prev)}
                >
                    {isSidebarCollapsed ? '»' : '«'}
                </button>

                {!isSidebarCollapsed && (
                    <>
                        <h2 className="sidebar-title">Stations</h2>

                        <div className="station-list">
                            {stations.map(station => (
                                <button
                                    key={station.name}
                                    type="button"
                                    className={`station-item ${selectedStationName === station.name ? 'active' : ''}`}
                                    onClick={() => handleSelectStation(station)}
                                >
                                    <span
                                        className="station-color-dot"
                                        style={{ backgroundColor: getStationColor(station.name) }}
                                    />
                                    {station.name}
                                </button>
                            ))}
                        </div>

                        {selectedStation && (
                            <div className="station-info-panel">
                                <details open>
                                    <summary>Live position</summary>
                                    <div className="dropdown-content">
                                        <p>Lat: {selectedStation.lat.toFixed(2)}°</p>
                                        <p>Lng: {selectedStation.lng.toFixed(2)}°</p>
                                        <p>Alt: {(selectedStation.alt * 6371 / 1.5).toFixed(0)} km</p>
                                    </div>
                                </details>

                                <details open>
                                    <summary>Station details</summary>
                                    <div className="dropdown-content">
                                        {stationLogo && (
                                            <img
                                                src={stationLogo}
                                                alt={selectedStationInfo?.name}
                                                className="station-logo"
                                            />
                                        )}

                                        {stationInfoLoading && <p>Loading...</p>}
                                        {stationInfoError && <p>{stationInfoError}</p>}

                                        {!stationInfoLoading && !stationInfoError && selectedStationInfo && (
                                            <>
                                                <p><strong>Name:</strong> {selectedStationInfo.name}</p>
                                                <p><strong>Status:</strong> {selectedStationInfo.status?.name || 'Unknown'}</p>
                                                <p><strong>Orbit:</strong> {selectedStationInfo.orbit || 'Unknown'}</p>
                                                <p><strong>Founded:</strong> {selectedStationInfo.founded || 'Unknown'}</p>
                                                <p><strong>Crew:</strong> {selectedStationInfo.onboard_crew ?? 'N/A'}</p>
                                                <p><strong>Docked vehicles:</strong> {selectedStationInfo.docked_vehicles ?? 'N/A'}</p>
                                                {activeExpeditionName && <p><strong>Active expedition:</strong> {activeExpeditionName}</p>}
                                                {stationOwners.length > 0 && (
                                                    <p><strong>Owners:</strong> {stationOwners.join(', ')}</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </details>

                                {activeExpeditionId && (
                                    <details open>
                                        <summary>Crew</summary>
                                        <div className="dropdown-content">
                                            {expeditionLoading && <p>Loading crew...</p>}

                                            {!expeditionLoading && expeditionData?.crew && expeditionData.crew.length > 0 && (
                                                <div className="crew-list">
                                                    {expeditionData.crew.map((crewMember) => (
                                                        <div key={crewMember.id} className="crew-member">
                                                            {crewMember.astronaut.image?.thumbnail_url && (
                                                                <img
                                                                    src={crewMember.astronaut.image.thumbnail_url}
                                                                    alt={crewMember.astronaut.name}
                                                                    className="crew-photo"
                                                                />
                                                            )}
                                                            <div className="crew-info">
                                                                <p className="crew-name">{crewMember.astronaut.name}</p>
                                                                <p className="crew-role">{crewMember.role?.role || 'N/A'}</p>
                                                                <p className="crew-agency">
                                                                    {crewMember.astronaut.agency?.abbrev || crewMember.astronaut.agency?.name || 'N/A'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </>
                )}
            </aside>

            <Globe 
                ref={globeRef} 
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                objectsData={stations}
                objectLat="lat"
                objectLng="lng"
                objectAltitude="alt"
                pathsData={trajectories}
                pathPoints="points"
                pathPointLat="lat"
                pathPointLng="lng"
                pathPointAlt="alt"
                pathColor="color"
                pathStroke={0.8}
                pathResolution={2}
                pathTransitionDuration={0}
                objectThreeObject={(obj) => {
                    if (!modelsReady) return new THREE.Object3D();
                    return getOrCreateStationModel(obj.name);
                }}
                onObjectClick={(obj) => {
                    handleSelectStation(obj);
                }}
            />
        </div>
    );
};


export default GlobeTracker;