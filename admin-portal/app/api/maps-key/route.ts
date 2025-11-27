import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header (frontend will send it)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      console.log('No token provided, using fallback key');
      return NextResponse.json({ api_key: 'AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0' });
    }
    
    // Get tenant slug from request
    const host = request.headers.get('host') || '';
    const subdomain = host.split('.')[0];
    
    // Fetch from backend using the proxy
    const response = await fetch(`http://127.0.0.1:8000/v1/org/maps-api-key`, {
      headers: {
        'x-tenant-slug': subdomain,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.log('Backend request failed, using fallback key');
      return NextResponse.json({ api_key: 'AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0' });
    }

    const data = await response.json();
    console.log('Got API key from backend:', data.google_api_key?.substring(0, 20) + '...');
    // Backend returns google_api_key, map it to api_key
    return NextResponse.json({ api_key: data.google_api_key || 'AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0' });
  } catch (error) {
    console.error('Error fetching maps API key:', error);
    // Return org key as fallback
    return NextResponse.json({ api_key: 'AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0' });
  }
}
