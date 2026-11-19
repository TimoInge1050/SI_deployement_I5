USE suivi_process;

-- AUTOMATES
CREATE TABLE automate (
    id_automate INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    adresse_ip VARCHAR(45) NOT NULL,
    port INT NOT NULL DEFAULT 502,
    protocole VARCHAR(20) NOT NULL DEFAULT 'Modbus TCP',
    unit_id INT DEFAULT 1,
    actif BOOLEAN NOT NULL DEFAULT TRUE
);

-- VARIABLES A SURVEILLER
CREATE TABLE variable (
    id_variable INT AUTO_INCREMENT PRIMARY KEY,
    id_automate INT NOT NULL,
    nom VARCHAR(100) NOT NULL,
    adresse_variable VARCHAR(100) NOT NULL,
    type_donnee VARCHAR(20) NOT NULL,
    unite VARCHAR(20),
    -- Période entre deux acquisitions, en secondes.
    frequence_acquisition INT NOT NULL DEFAULT 1,
    actif BOOLEAN NOT NULL DEFAULT TRUE,

    FOREIGN KEY (id_automate)
        REFERENCES automate(id_automate)
        ON DELETE CASCADE,

    CHECK (frequence_acquisition > 0)
);

-- HISTORIQUE DES RELEVES
CREATE TABLE releve (
    id_releve BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_variable INT NOT NULL,
    horodatage DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    valeur DOUBLE,
    qualite VARCHAR(20) NOT NULL DEFAULT 'GOOD',

    FOREIGN KEY (id_variable)
        REFERENCES variable(id_variable)
        ON DELETE CASCADE,

    INDEX idx_variable_date (id_variable, horodatage)
);