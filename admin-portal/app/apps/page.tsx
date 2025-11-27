"use client";
import { Download, Smartphone, Globe } from "lucide-react";

export default function AppsPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Mobile Apps</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Rider Android App */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <Smartphone size={32} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Rider App</h2>
              <p className="text-sm text-gray-600">Android</p>
            </div>
          </div>
          
          <p className="text-gray-700 mb-4">
            Download the rider delivery app to accept orders, navigate to customers, 
            and complete deliveries with proof of delivery.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-sm mb-2">Features:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Real-time order notifications</li>
              <li>✓ GPS navigation integration</li>
              <li>✓ Photo proof of delivery</li>
              <li>✓ Cash/UPI/Card payment collection</li>
              <li>✓ Offline mode support</li>
              <li>✓ Live location tracking</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                <strong>✅ APK Ready to Download</strong><br/>
                The Android app is built and ready to install on your device.<br/>
                <span className="text-xs">Version 0.1.0 • Built on Nov 15, 2025</span>
              </p>
            </div>
            
            <a 
              href="/downloads/rider-app.apk" 
              download
              className="flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Download size={20} />
              Download APK (12 MB)
            </a>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> Enable "Install from unknown sources" in your Android settings to install this app.
              </p>
            </div>
            
            <div className="text-xs text-gray-600 space-y-1">
              <p><strong>Version:</strong> 0.1.0</p>
              <p><strong>Size:</strong> 12 MB</p>
              <p><strong>Requires:</strong> Android 7.0 or higher</p>
              <p><strong>Package:</strong> com.digitalchain.rider</p>
            </div>
          </div>
        </div>
        
        {/* Web Rider Portal */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Globe size={32} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Web Portal</h2>
              <p className="text-sm text-gray-600">Browser-based</p>
            </div>
          </div>
          
          <p className="text-gray-700 mb-4">
            Access the rider portal from any web browser on desktop or mobile. 
            No installation required.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-sm mb-2">Features:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Works on any device</li>
              <li>✓ Auto-updates</li>
              <li>✓ Same features as app</li>
              <li>✓ No installation needed</li>
              <li>✓ Progressive Web App (PWA)</li>
            </ul>
          </div>
          
          <a 
            href="/rider/orders" 
            target="_blank"
            className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Globe size={20} />
            Open Web Portal
          </a>
          
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800">
              <strong>Tip:</strong> Add this page to your home screen for a native app-like experience!
            </p>
          </div>
        </div>
      </div>
      
      {/* Build Instructions */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-3">📱 Build Android App (Developers)</h2>
        <div className="bg-white rounded-lg p-4 font-mono text-sm text-gray-800 overflow-x-auto">
          <div className="space-y-2">
            <p className="text-gray-600"># Navigate to Android project</p>
            <p>cd /root/digitalchain/rider-android</p>
            <p className="text-gray-600 mt-3"># Build APK</p>
            <p>./gradlew assembleDebug</p>
            <p className="text-gray-600 mt-3"># Copy to downloads folder</p>
            <p>cp app/build/outputs/apk/debug/app-debug.apk /opt/digitalchain/admin-portal/public/downloads/rider-app.apk</p>
            <p className="text-gray-600 mt-3"># APK will be available at:</p>
            <p>https://jugesh.digitalchain.in/downloads/rider-app.apk</p>
          </div>
        </div>
      </div>
    </div>
  );
}
