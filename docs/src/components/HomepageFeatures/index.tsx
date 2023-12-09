import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Top End User Experience',
    Svg: require('@site/static/img/undraw_ux.svg').default,
    description: (
      <>
        The react library comes loaded with user experiencing enriching features,
          ensuring the user stays authenticated without all the unnecessary redirects
          and data loss.
      </>
    ),
  },
  {
    title: 'Scalability Built In',
    Svg: require('@site/static/img/hero-cluster.svg').default,
    description: (
      <>
        Running multiple instances of your backend? Use the provided Redis clustering plugin
          library to sync efforts and secure apps across your scaled platform.
      </>
    ),
  },
  {
    title: 'Financial-grade API 2.0',
    Svg: require('@site/static/img/undraw_security.svg').default,
    description: (
      <>
        Founded on the principles and requirements of the FAPI 2.0 security profile.
          <br />
          <sub>*DPoP support pending</sub>
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
