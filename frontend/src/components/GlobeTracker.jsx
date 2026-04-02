import React, { useState, useEffect, useRef } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const GlobeTracker = () => {
    const globeRef = useRef();
    const [stations, setStations] = useState([]);
    const [model3D, setModel3D] = useState(null);

    // Load 3D model
    useEffect(() => {
        const loader = new GLTFLoader();
        loader.load('/models/iss.glb', (gltf) => {
            gltf.scene.scale.set(2.5, 2.5, 2.5); // Scale down the model
            // Rotate the model to align with the satellite's orientation
            gltf.scene.rotation.x = Math.PI / 2;
            setModel3D(gltf.scene);
        })

    }, []);

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
                }, 1000);
            } catch (error) {
                console.error('Error fetching TLE data:', error);
            }
        };

        fetchStations();

        return () => clearInterval(intervalId);
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }}>
            <Globe 
                ref={globeRef} 
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                objectsData={stations}
                objectLat="lat"
                objectLng="lng"
                objectAltitude="alt"
                objectThreeObject={() => {
                    if (!model3D) return THREE.Mesh();
                    return model3D.clone();
                }}
                onObjectClick={(obj) => {
                    console.log(`Clicked on ${obj.name}`);
                }}
            />
        </div>
    );
};


export default GlobeTracker;