import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TDF Donation Dashboard',
    short_name: 'TDF Dashboard',
    description: 'Analytics hub for TDF Donations',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#047857',
    icons: [
      {
        src: '/logo.png', // Temporary until user replaces with 192x192
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo.png', // Temporary until user replaces with 512x512
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
