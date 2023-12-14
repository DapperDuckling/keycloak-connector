import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Keycloak Connector',
  tagline: 'An opinionated auth library built to secure javascript applications.',
  favicon: 'img/keycloak-logo.svg',

  // Set the production url of your site here
  url: 'https://keycloak-connector.dapperduckling.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'DapperDuckling', // Usually your GitHub org/user name.
  projectName: 'keycloak-connector', // Usually your repo name.
  // trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-1',
        entryPoints: ['../packages/common'],
        entryPointStrategy: 'packages',
        out: 'api/common',
        sidebar: {
          categoryLabel: 'Common',
          position: 3,
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-2',
        entryPoints: ['../packages/backend/server'],
        entryPointStrategy: 'packages',
        out: 'api/Backend/server',
        sidebar: {
          categoryLabel: 'Server',
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-3',
        entryPoints: ['../packages/backend/group-auth-plugin'],
        entryPointStrategy: 'packages',
        out: 'api/Backend/group-auth-plugin',
        sidebar: {
          categoryLabel: 'Group Auth Plugin',
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-4',
        entryPoints: ['../packages/backend/cluster-redis'],
        entryPointStrategy: 'packages',
        out: 'api/Backend/cluster-redis',
        sidebar: {
          categoryLabel: 'Cluster Redis',
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-5',
        entryPoints: ['../packages/frontend/client'],
        entryPointStrategy: 'packages',
        out: 'api/Frontend/client',
        sidebar: {
          categoryLabel: 'Client',
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-6',
        entryPoints: ['../packages/frontend/react'],
        entryPointStrategy: 'packages',
        out: 'api/Frontend/react',
        sidebar: {
          categoryLabel: 'React',
        },
      },
    ],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // Serve the docs at the site's root
          sidebarPath: './sidebars.ts',
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/DapperDuckling/keycloak-connector/tree/main/docs/',
        },

        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/social-media-card.png',
    navbar: {
      title: 'Keycloak Connector',
      logo: {
        alt: 'Keycloak Connector Logo',
        src: 'img/keycloak-logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'api',
          position: 'left',
          label: 'API',
        },
        // {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/DapperDuckling/keycloak-connector',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Tutorial',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/keycloak-connector',
            }
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'NPM - Server',
              href: 'https://www.npmjs.com/package/@dapperduckling/keycloak-connector-server',
            },
            {
              label: 'NPM - Client',
              href: 'https://www.npmjs.com/package/@dapperduckling/keycloak-connector-client',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/DapperDuckling/keycloak-connector',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} DapperDuckling LLC. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
