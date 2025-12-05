export const loadGoogleMaps = (opts?: { libraries?: string[]; callbackName?: string }) => {
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!key) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set in environment'));
  }

  const libraries = opts?.libraries || ['places'];
  const callbackName = opts?.callbackName || '__gmapsOnLoad';

  // If already loaded, resolve immediately
  if ((window as any).google && (window as any).google.maps) {
    return Promise.resolve((window as any).google);
  }

  // If a script with our src already exists, wait for its load
  const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=${encodeURIComponent(libraries.join(','))}&callback=${callbackName}`;
  if (document.querySelector(`script[src^="https://maps.googleapis.com/maps/api/js"]`)) {
    // The script is present but maybe still loading; set up a short interval to check
    return new Promise((resolve, reject) => {
      const check = () => {
        if ((window as any).google && (window as any).google.maps) return resolve((window as any).google);
      };
      const int = setInterval(() => {
        try {
          check();
        } catch (e) {}
      }, 200);
      // Timeout after 10s
      setTimeout(() => {
        clearInterval(int);
        if ((window as any).google && (window as any).google.maps) return resolve((window as any).google);
        reject(new Error('Timed out waiting for Google Maps script to load'));
      }, 10000);
    });
  }

  return new Promise((resolve, reject) => {
    // Create global callback
    (window as any)[callbackName] = () => {
      resolve((window as any).google);
      try {
        delete (window as any)[callbackName];
      } catch (e) {}
    };

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onerror = (err) => {
      reject(new Error('Failed to load Google Maps script'));
    };

    document.head.appendChild(script);
  });
};
