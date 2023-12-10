import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Keycloak Connector',
  tagline: 'An opinionated auth library built to secure React (and more) apps.',
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

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
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
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Tutorial',
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
