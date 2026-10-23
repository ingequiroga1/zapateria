export function readConnectionConfig(env) {
  const url = (env.VITE_SUPABASE_URL || '').trim();

  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const demo = env.VITE_DEMO_MODE === 'true';

  if (demo) {
    return {
      url: '',
      key: '',
      demo: true,
      error: '',
    };
  }

  if (!url || !key) {
    return {
      url: '',
      key: '',
      demo: false,
      error:
        'Falta configurar la conexión de la aplicación. ' +
        'Contacta al responsable de la instalación.',
    };
  }

  try {
    if (new URL(url).protocol !== 'https:') {
      throw Error();
    }

    if (key.startsWith('sb_secret_')) {
      throw Error();
    }

    if (!key.startsWith('sb_publishable_')) {
      const parts = key.split('.');

      if (parts.length !== 3) {
        throw Error();
      }

      const payload = JSON.parse(
        atob(
          parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/')
        )
      );

      if (payload.role !== 'anon') {
        throw Error();
      }
    }

    return {
      url,
      key,
      demo: false,
      error: '',
    };
  } catch {
    return {
      url: '',
      key: '',
      demo: false,
      error:
        'La configuración de conexión no es válida. ' +
        'Revisa la URL HTTPS y la clave publicable de Supabase.',
    };
  }
}