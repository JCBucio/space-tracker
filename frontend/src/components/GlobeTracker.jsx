import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const getStationColor = (name = '') => {
    if (name.includes('ISS')) return '#00E5FF';
    if (name.includes('CSS') || name.includes('TIANHE')) return '#FF4D6D';
    return '#FFFFFF';
};

const GlobeTracker = ({ selectedStationName = '', onStationsUpdate, onStationSelect }) => {
    const globeRef = useRef();
    const lastFocusedSelectionRef = useRef('');
    const [stations, setStations] = useState([]);
    const [trajectories, setTrajectories] = useState([]);
    const [modelsReady, setModelsReady] = useState(false);
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

    useEffect(() => {
        if (typeof onStationsUpdate === 'function') {
            onStationsUpdate(stations);
        }
    }, [stations, onStationsUpdate]);

    useEffect(() => {
        if (!selectedStationName || stations.length === 0) return;
        if (lastFocusedSelectionRef.current === selectedStationName) return;

        const selectedStation = stations.find((station) => station.name === selectedStationName);
        if (selectedStation) {
            focusStation(selectedStation);
            lastFocusedSelectionRef.current = selectedStationName;
        }
    }, [selectedStationName, stations]);

    // Fetch data from the API
    useEffect(() => {
        let intervalId;

        const fetchStations = async () => {
            try {
                const res = await fetch('https://space-tracker-8pjk.onrender.com/api/tles');
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

    return (
        <div className="tracker-layout globe-layout" style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }}>
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
                    focusStation(obj);

                    if (typeof onStationSelect === 'function') {
                        onStationSelect(obj.name);
                    }
                }}
            />
        </div>
    );
};


export default GlobeTracker;