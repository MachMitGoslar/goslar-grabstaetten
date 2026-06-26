import {CemeteryCard} from "../components/CemeteryCard.tsx";
import {ButtonTile} from "../components/ButtonTile.tsx";
import cemeteries from '../data/cemeteries.json';
import './Home.css';

type Cemetery = {
    name: string;
    street: string;
    city: string;
    zipCode: string;
    url: string;
    image: string;
};

const cemeteryImages = import.meta.glob('../assets/cemeteries/*', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const getCemeteryImage = (imagePath: string) => {
    const fileName = imagePath.replace(/^\//, '');

    return cemeteryImages[`../assets/cemeteries/${fileName}`] ?? '';
};

export const HomePage = () => {
    return (
        <main className="home-page">
            <section className="home-hero">
                <h1 className="home-title">Goslarer Gräber</h1>

                <p className="home-subtitle">
                    Nutze unsere Grabstellensuche oder starte deine Geotour entlang
                    bekannter Goslarer Gräber
                </p>
            </section>

            <section className="home-actions">
                <ButtonTile text="Grabstellensuche" to="/grabstellensuche" />
                <ButtonTile text="Friedhofstour" to="/geotour" />
            </section>

            <section className="home-cemeteries">
                <h2 className="home-section-title">Goslarer Friedhöfe</h2>

                <p className="home-section-subtitle">
                    Erfahre mehr über die Friedhöfe in Goslar.
                </p>

                <div className="home-cemetery-list">
                    {(cemeteries as Cemetery[]).map((cemetery) => (
                        <CemeteryCard
                            key={`${cemetery.name}-${cemetery.street}`}
                            name={cemetery.name}
                            street={cemetery.street}
                            zipCode={cemetery.zipCode}
                            city={cemetery.city}
                            image={getCemeteryImage(cemetery.image)}
                            href={cemetery.url}
                        />
                    ))}
                </div>
            </section>
        </main>
    );
};
