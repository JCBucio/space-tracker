import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Atom, Binoculars, Satellite, Info, ChevronRight } from 'lucide-react';

const getStationTypeByName = (name = '') => {
  if (name.includes('ISS')) return 'iss';
  if (name.includes('CSS') || name.includes('TIANHE')) return 'css';
  return null;
};

const getStationColor = (name = '') => {
  if (name.includes('ISS')) return '#00E5FF';
  if (name.includes('CSS') || name.includes('TIANHE')) return '#FF4D6D';
  return '#FFFFFF';
};

const Sidebar = ({ stations = [], selectedStationName = '', onStationSelect }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isStationsMenuOpen, setIsStationsMenuOpen] = useState(true);
  const [isTrackerMenuOpen, setIsTrackerMenuOpen] = useState(true);
  const [isAboutMenuOpen, setIsAboutMenuOpen] = useState(true);
  const [stationInfoCache, setStationInfoCache] = useState({ iss: null, css: null });
  const [stationInfoLoading, setStationInfoLoading] = useState(false);
  const [stationInfoError, setStationInfoError] = useState('');
  const [expeditionData, setExpeditionData] = useState(null);
  const [expeditionLoading, setExpeditionLoading] = useState(false);
  const expeditionCacheRef = useRef({});

  const selectedStation = useMemo(
    () => stations.find((station) => station.name === selectedStationName) || null,
    [stations, selectedStationName]
  );

  const selectedStationType = getStationTypeByName(selectedStationName);
  const selectedStationInfo = selectedStationType ? stationInfoCache[selectedStationType] : null;
  const stationOwners = selectedStationInfo?.owners?.map((owner) => owner.abbrev || owner.name) || [];
  const activeExpeditionId = selectedStationInfo?.active_expeditions?.[0]?.id;
  const activeExpeditionName = selectedStationInfo?.active_expeditions?.[0]?.name;
  const stationLogo = selectedStationInfo?.image?.thumbnail_url;

  const toggleSidebar = () => setIsCollapsed((previous) => !previous);

  const handleStationsHeaderClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsStationsMenuOpen(true);
      return;
    }

    setIsStationsMenuOpen((previous) => !previous);
  };

  const handleMenuHeaderClick = () => {
    setIsCollapsed(false);
  };

  const handleTrackerHeaderClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsTrackerMenuOpen(true);
      return;
    }

    setIsTrackerMenuOpen((previous) => !previous);
  };

  const handleAboutHeaderClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsAboutMenuOpen(true);
      return;
    }

    setIsAboutMenuOpen((previous) => !previous);
  };

  const handleSelectStation = (station) => {
    if (onStationSelect) {
      onStationSelect(station.name);
    }

    setIsCollapsed(false);
    setIsStationsMenuOpen(true);
  };

  useEffect(() => {
    const loadStationInfo = async () => {
      if (!selectedStationType || stationInfoCache[selectedStationType]) return;

      const endpoint = selectedStationType === 'iss'
        ? 'http://localhost:3001/api/iss-info'
        : 'http://localhost:3001/api/css-info';

      try {
        setStationInfoError('');
        setStationInfoLoading(true);

        const response = await fetch(endpoint);
        const data = await response.json();

        setStationInfoCache((previous) => ({
          ...previous,
          [selectedStationType]: data,
        }));
      } catch (error) {
        console.error('Error loading station info:', error);
        setStationInfoError('Could not load station information.');
      } finally {
        setStationInfoLoading(false);
      }
    };

    loadStationInfo();
  }, [selectedStationType, stationInfoCache]);

  useEffect(() => {
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

    loadExpeditionData(activeExpeditionId);
  }, [activeExpeditionId]);

  return (
    <aside className={`station-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header" onClick={toggleSidebar} role="button" tabIndex={0}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">
            <Atom className="sidebar-brand-mark" size={16} />
          </div>
          <div className="sidebar-brand-text">
            <div className="sidebar-title">SpaceTracker</div>
            <div className="sidebar-subtitle">Live orbital dashboard</div>
          </div>
        </div>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section">
          <button className="section-header" type="button" onClick={handleStationsHeaderClick}>
            <Satellite className="section-icon" size={18} />
            {!isCollapsed && <span className="section-label">Stations</span>}
            {!isCollapsed && (
              <ChevronRight className={`section-chevron ${isStationsMenuOpen ? 'rotated' : ''}`} size={16} />
            )}
          </button>

          {!isCollapsed && isStationsMenuOpen && (
            <div className="station-list">
              {stations.map((station) => {
                const isActive = selectedStationName === station.name;

                return (
                  <button
                    key={station.name}
                    type="button"
                    className={`nav-item ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed-item' : ''}`}
                    onClick={() => handleSelectStation(station)}
                  >
                    <span className="nav-icon">🛰</span>
                    {!isCollapsed && <span className="nav-label">{station.name}</span>}
                    <span
                      className="station-color-dot"
                      style={{ backgroundColor: getStationColor(station.name) }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <button className="section-header" type="button" onClick={handleTrackerHeaderClick}>
            <Binoculars className="section-icon" size={18} />
            {!isCollapsed && <span className="section-label">Tracker</span>}
            {!isCollapsed && <ChevronRight className={`section-chevron ${isTrackerMenuOpen ? 'rotated' : ''}`} size={16} />}
          </button>

          {!isCollapsed && isTrackerMenuOpen && (
            selectedStation ? (
              <div className="tracker-card">
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
                              {crewMember.astronaut.image?.thumbnail_url ? (
                                <img
                                  src={crewMember.astronaut.image.thumbnail_url}
                                  alt={crewMember.astronaut.name}
                                  className="crew-photo"
                                />
                              ) : (
                                <div
                                  className="crew-photo-placeholder"
                                  aria-label={`No photo for ${crewMember.astronaut.name}`}
                                  title={crewMember.astronaut.name}
                                >
                                  {(crewMember.astronaut.name || '?').charAt(0).toUpperCase()}
                                </div>
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
            ) : (
              <div className="tracker-card tracker-card-empty">
                Select a station to view live data and crew details.
              </div>
            )
          )}
        </div>

        <div className="sidebar-section">
          <button className="section-header" type="button" onClick={handleAboutHeaderClick}>
            <Info className="section-icon" size={18} />
            {!isCollapsed && <span className="section-label">About</span>}
            {!isCollapsed && <ChevronRight className={`section-chevron ${isAboutMenuOpen ? 'rotated' : ''}`} size={16} />}
          </button>

          {!isCollapsed && isAboutMenuOpen && (
            <div className="sidebar-about-card">
              <h3>What is this app?</h3>
              <p>
                SpaceTracker visualizes the ISS (International Space Station) and CSS (Chinese Space Station) in real time on a 3D globe using 
                TLE (Two-Line Element set) propagation. It also shows predicted trajectories for the next orbit, station metadata and active 
                expedition crew details.
                <br />
                <br />
                Real time location data is calculated client-side using satellite.js and TLE data fetched from{' '}
                <a className="about-link" href="https://celestrak.org/" target="_blank" rel="noopener noreferrer">Celestrak</a>.
                {' '}Stations metadata and crew details are fetched from{' '}
                <a className="about-link" href="https://thespacedevs.com/llapi" target="_blank" rel="noopener noreferrer">The Space Devs API</a>.
                <br />
                <br />
                This project is open source on{' '}
                <a className="about-link" href="https://github.com/JCBucio/space-tracker" target="_blank" rel="noopener noreferrer">GitHub</a>.
                <br />
                <br />
                Built by{' '}
                <a className="about-link" href="https://jcbucio.github.io/" target="_blank" rel="noopener noreferrer">Juan Carlos Bucio T.</a>{' '}
                using{' '}
                <a className="about-link" href="https://react.dev/" target="_blank" rel="noopener noreferrer">React</a>,{' '}
                <a className="about-link" href="https://threejs.org/" target="_blank" rel="noopener noreferrer">Three.js</a>{' '}
                and{' '}
                <a className="about-link" href="https://satellitejs.com/" target="_blank" rel="noopener noreferrer">satellite.js</a>.
                {' '}Icons from{' '}
                <a className="about-link" href="https://lucide.dev/" target="_blank" rel="noopener noreferrer">Lucide</a>. 3D station models from{' '}
                <a className="about-link" href="https://sketchfab.com/" target="_blank" rel="noopener noreferrer">Sketchfab</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;