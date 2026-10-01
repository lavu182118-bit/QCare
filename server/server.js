const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();
const app = express();

const PORT = 3000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/check-patient-phone/:phone", (req, res) => {

    const phone = req.params.phone;

    const sql = `
        SELECT id
        FROM patients
        WHERE phone = ?
        LIMIT 1
    `;

    db.query(sql, [phone], (err, results) => {

        if (err) {
            console.error("CHECK PATIENT PHONE ERROR:", err);

            return res.status(500).json({
                success: false,
                message: "Unable to check phone number."
            });
        }

        return res.json({
            success: true,
            exists: results.length > 0
        });
    });

});
// ===============================
// MYSQL CONNECTION
// ===============================

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        minVersion: "TLSv1.2"
    }
});
db.connect((err) => {

    if (err) {
        console.error("MySQL connection failed:", err);
        return;
    }

    console.log("MySQL connected successfully!");

});

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {

    res.send("QueueCare server is running!");

});

// ===============================
// TEST DATABASE
// ===============================

app.get("/test-db", (req, res) => {

    db.query("SELECT 1", (err) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Database connection failed."
            });

        }

        res.json({
            success: true,
            message: "QueueCare database is working!"
        });

    });

});

// ======================================================
// HOSPITAL REGISTRATION
// ======================================================

app.post("/register-hospital", async (req, res) => {

    const {
        name,
        email,
        phone,
        address,
        password
    } = req.body;

    if (!name || !email || !phone || !address || !password) {

        return res.status(400).json({
            success: false,
            message: "Please fill all required fields."
        });

    }

    if (!/^[6-9][0-9]{9}$/.test(phone)) {

        return res.status(400).json({
            success: false,
            message: "Enter a valid 10-digit mobile number."
        });

    }

    if (password.length < 6) {

        return res.status(400).json({
            success: false,
            message: "Password must contain at least 6 characters."
        });

    }

    db.query(
        "SELECT id FROM hospitals WHERE email = ?",
        [email],
        async (err, results) => {

            if (err) {

                console.error("Hospital email check error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Database error."
                });

            }

            if (results.length > 0) {

                return res.status(400).json({
                    success: false,
                    message: "Hospital email already registered."
                });

            }

            db.query(
                "SELECT id FROM hospitals WHERE phone = ?",
                [phone],
                async (err, phoneResults) => {

                    if (err) {

                        console.error(
                            "Hospital phone check error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message: "Database error."
                        });

                    }

                    if (phoneResults.length > 0) {

                        return res.status(400).json({
                            success: false,
                            message:
                                "Phone number already registered."
                        });

                    }

                    try {

                        const hospitalId =
                            "HC" + Date.now();

                        const hashedPassword =
                            await bcrypt.hash(password, 10);

                        const sql = `
                            INSERT INTO hospitals
                            (
                                hospital_id,
                                name,
                                email,
                                phone,
                                address,
                                password,
                                status
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;

                        const values = [
                            hospitalId,
                            name,
                            email,
                            phone,
                            address,
                            hashedPassword,
                            "Pending"
                        ];

                        db.query(
                            sql,
                            values,
                            (err) => {

                                if (err) {

                                    console.error(
                                        "Hospital registration error:",
                                        err
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message:
                                            "Hospital registration failed."
                                    });

                                }

                                res.json({
                                    success: true,
                                    message:
                                        "Hospital registered successfully!",
                                    hospitalId:
                                        hospitalId
                                });

                            }
                        );

                    } catch (error) {

                        console.error(
                            "Password hashing error:",
                            error
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Unable to secure password."
                        });

                    }

                }
            );

        }
    );

});

// ======================================================
// HOSPITAL LOGIN
// ======================================================

app.post("/hospital-login", (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (!email || !password) {

        return res.status(400).json({
            success: false,
            message:
                "Please enter email and password."
        });

    }

    const sql = `
        SELECT
            id,
            hospital_id,
            name,
            email,
            phone,
            address,
            password,
            status
        FROM hospitals
        WHERE email = ?
        LIMIT 1
    `;

    db.query(
        sql,
        [email],
        async (err, results) => {

            if (err) {

                console.error(
                    "Hospital login error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Database error."
                });

            }

            if (results.length === 0) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            const hospital = results[0];

            let passwordValid = false;

            try {

                if (
                    hospital.password &&
                    hospital.password.startsWith("$2")
                ) {

                    passwordValid =
                        await bcrypt.compare(
                            password,
                            hospital.password
                        );

                } else {

                    passwordValid =
                        password === hospital.password;

                    if (passwordValid) {

                        const newHash =
                            await bcrypt.hash(
                                password,
                                10
                            );

                        db.query(
                            "UPDATE hospitals SET password = ? WHERE id = ?",
                            [
                                newHash,
                                hospital.id
                            ],
                            (updateErr) => {

                                if (updateErr) {

                                    console.error(
                                        "Password migration error:",
                                        updateErr
                                    );

                                }

                            }
                        );

                    }

                }

            } catch (error) {

                console.error(
                    "Password verification error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify password."
                });

            }

            if (!passwordValid) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            if (hospital.status === "Pending") {

                return res.status(403).json({
                    success: false,
                    message:
                        "Your hospital registration is still pending Admin approval."
                });

            }

            if (hospital.status === "Rejected") {

                return res.status(403).json({
                    success: false,
                    message:
                        "Your hospital registration has been rejected by Admin."
                });

            }

            
            delete hospital.password;

            res.json({
                success: true,
                message:
                    "Hospital login successful!",
                hospital:
                    hospital
            });

        }
    );

});

// ======================================================
// PUBLIC ACTIVE HOSPITALS
// ======================================================

app.get("/hospitals", (req, res) => {

    const sql = `
        SELECT
            id,
            hospital_id,
            name,
            email,
            phone,
            address,
            status,
            created_at
        FROM hospitals
        WHERE status = 'Active'
        ORDER BY id DESC
    `;

    db.query(
        sql,
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital fetch error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to fetch hospitals."
                });

            }

            res.json({
                success: true,
                hospitals:
                    results
            });

        }
    );

});
// ======================================================
// PATIENTS
// ======================================================

app.post("/patients", async (req, res) => {

    const {
        name,
        phone,
        email,
        age,
        gender,
        password
    } = req.body;

    if (!name || !phone || !password) {

        return res.status(400).json({
            success: false,
            message: "Patient name, phone and password are required."
        });

    }

    try {

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO patients
            (name, phone, email, age, gender, password)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                name,
                phone,
                email || null,
                age || null,
                gender || null,
                hashedPassword
            ],
            (err, result) => {

                if (err) {

                    console.error(
                        "Patient insert error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Unable to add patient."
                    });

                }

                res.json({
                    success: true,
                    message: "Patient registered successfully.",
                    patientId: result.insertId
                });

            }
        );

    } catch (error) {

        console.error(
            "Password hashing error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to register patient."
        });

    }

});

app.post("/patient-register", (req, res) => {

    const {
        name,
        phone,
        age,
        gender
    } = req.body;

    if (!name || !phone) {
        return res.status(400).json({
            success: false,
            message: "Patient name and phone are required."
        });
    }

    // Check whether phone number already exists
    const checkSql = `
        SELECT id
        FROM patients
        WHERE phone = ?
        LIMIT 1
    `;

    db.query(
        checkSql,
        [phone],
        (err, results) => {

            if (err) {

                console.error(
                    "PATIENT PHONE CHECK ERROR:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to check patient phone number."
                });
            }

            // Phone already registered
            if (results.length > 0) {

                return res.status(409).json({
                    success: false,
                    message:
                        "Phone number already registered. Please try another phone number."
                });
            }

            // Register new patient
            const insertSql = `
                INSERT INTO patients
                (name, phone, age, gender)
                VALUES (?, ?, ?, ?)
            `;

            db.query(
                insertSql,
                [
                    name,
                    phone,
                    age || null,
                    gender || null
                ],
                (err, result) => {

                    if (err) {

                        console.error(
                            "PATIENT INSERT ERROR:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message: err.message,
                            errorCode: err.code
                        });
                    }

                    console.log(
                        "Patient registered successfully. ID:",
                        result.insertId
                    );

                    return res.json({
                        success: true,
                        message:
                            "Patient registered successfully.",
                        patientId:
                            result.insertId
                    });

                }
            );

        }
    );

});

app.post("/patient-login", (req, res) => {

    const { name, phone } = req.body;

    if (!name || !phone) {
        return res.status(400).json({
            success: false,
            message: "Name and phone number are required."
        });
    }

    const sql = `
        SELECT *
        FROM patients
        WHERE name = ? AND phone = ?
        LIMIT 1
    `;

    db.query(sql, [name, phone], (err, results) => {

        if (err) {

            console.error("Patient login error:", err);

            return res.status(500).json({
                success: false,
                message: "Unable to login."
            });

        }

        if (results.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Patient not found. Check your name and phone number."
            });

        }

        const patient = results[0];

        delete patient.password;

        res.json({
            success: true,
            message: "Patient login successful.",
            patient: patient
        });

    });

});
// ======================================================
// LIVE QUEUE - ADD PATIENT
// ======================================================

const notifications = {};
app.post("/live-queue", (req, res) => {

    const {
        hospitalId,
        patientId,
        patient,
        phone,
        doctor
    } = req.body;

    if (!hospitalId || !patientId || !patient || !doctor) {

        return res.status(400).json({
            success: false,
            message:
                "Hospital ID, patient and doctor are required."
        });

    }

    let prefix = "Q";

    if (doctor.startsWith("General Physician")) {

        prefix = "GP";

    } else if (doctor.startsWith("Cardiologist")) {

        prefix = "CAR";

    } else if (doctor.startsWith("Orthopedic")) {

        prefix = "ORT";

    } else if (doctor.startsWith("Dermatologist")) {

        prefix = "DER";

    }

    // Only ACTIVE hospitals can receive bookings

    const hospitalSql = `
        SELECT
            id,
            name
        FROM hospitals
        WHERE id = ?
        AND status = 'Active'
        LIMIT 1
    `;

    db.query(
        hospitalSql,
        [hospitalId],
        (err, hospitalResults) => {

            if (err) {

                console.error(
                    "Hospital lookup error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Database error."
                });

            }

            if (hospitalResults.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Hospital not found or is not active."
                });

            }

            const hospital =
                hospitalResults[0];

            const tokenSql = `
                SELECT
                    token
                FROM live_queue
                WHERE hospital_id = ?
                AND doctor = ?
                AND DATE(appointment_time) = CURDATE()
                ORDER BY id DESC
                LIMIT 1
            `;

            db.query(
                tokenSql,
                [
                    hospital.id,
                    doctor
                ],
                (err, tokenResults) => {

                    if (err) {

                        console.error(
                            "Token generation error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Unable to generate token."
                        });

                    }

                    let tokenNumber = 1;

                    if (tokenResults.length > 0) {

                        const lastToken =
                            tokenResults[0].token;

                        const match =
                            lastToken.match(/(\d+)$/);

                        if (match) {

                            tokenNumber =
                                parseInt(
                                    match[1],
                                    10
                                ) + 1;

                        }

                    }

                    const token =
                        prefix + "-" + tokenNumber;

                    const queueSql = `
    INSERT INTO live_queue
    (
        patient_id,
        hospital_id,
        patient_name,
        phone,
        doctor,
        token,
        status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'Waiting')
`;
                    

                    db.query(
                        queueSql,
                        [
                            patientId,
                            hospital.id,
                            patient,
                            phone || null,
                            doctor,
                            token
                        ],
                        (err) => {

                            if (err) {

                                console.error(
                                    "Live queue insert error:",
                                    err
                                );

                                return res.status(500).json({
                                    success: false,
                                    message:
                                        "Unable to add patient to live queue."
                                });

                            }

                            console.log(
                                "Patient added to hospital ID:",
                                hospital.id
                            );

                            console.log(
                                "Generated token:",
                                token
                            );

                            
                            // EXISTING notification system
notifications[token] = {
    message:
        `Appointment booked successfully. Your token is ${token}.`,
    createdAt: new Date()
};

// SAVE PATIENT NOTIFICATION HISTORY
const patientNotificationSql = `
    INSERT INTO patient_notifications
    (
        patient_id,
        token,
        title,
        message,
        type
    )
    VALUES (?, ?, ?, ?, ?)
`;

db.query(
    patientNotificationSql,
    [
        patientId,
        token,
        "Appointment Booked",
        `Appointment booked successfully. Your token is ${token}.`,
        "appointment"
    ],
    (notificationErr) => {

        if (notificationErr) {
            console.error(
                "Patient notification history error:",
                notificationErr
            );
        }

        // EXISTING SUCCESS RESPONSE
        res.json({
            success: true,
            message:
                "Patient added to live queue.",
            token:
                token,
            hospitalId:
                hospital.id,
            hospitalName:
                hospital.name
        });

    }
);
                        }
                    );

                }
            );

        }
    );

});

// ======================================================
// GET LIVE QUEUE FOR HOSPITAL
// ======================================================

app.get("/live-queue/:hospitalId", (req, res) => {

    const hospitalId =
        req.params.hospitalId;

    const sql = `
        SELECT
            id,
            hospital_id,
            patient_name,
            phone,
            doctor,
            token,
            status,
            appointment_time
        FROM live_queue
        WHERE hospital_id = ?
        AND DATE(appointment_time) = CURDATE()
        ORDER BY id ASC
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Live queue fetch error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load live queue."
                });

            }

            res.json({
                success: true,
                queue:
                    results
            });

        }
    );

});

/* =====================================
   DOCTOR AVAILABILITY
===================================== */

app.get("/doctor-availability/:hospitalId", (req, res) => {

    const hospitalId = req.params.hospitalId;

    if (!hospitalId) {
        return res.status(400).json({
            success: false,
            message: "Hospital ID is required."
        });
    }

    const sql = `
        SELECT
            id,
            hospital_id,
            doctor,
            status,
            expected_arrival_time,
            updated_at
        FROM doctor_availability
        WHERE hospital_id = ?
        ORDER BY id ASC
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Doctor availability fetch error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load doctor availability."
                });
            }

            res.json({
                success: true,
                doctors: results
            });

        }
    );

});


app.post("/doctor-availability", (req, res) => {

    const {
        hospitalId,
        doctor,
        status,
        expectedArrivalTime
    } = req.body;

    if (!hospitalId || !doctor || !status) {

        return res.status(400).json({
            success: false,
            message:
                "Hospital, doctor and status are required."
        });

    }

    const checkSql = `
        SELECT id
        FROM doctor_availability
        WHERE hospital_id = ?
        AND doctor = ?
        LIMIT 1
    `;

    db.query(
        checkSql,
        [hospitalId, doctor],
        (err, results) => {

            if (err) {

                console.error(
                    "Doctor availability check error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check doctor availability."
                });

            }

            if (results.length > 0) {

                const updateSql = `
                    UPDATE doctor_availability
                    SET
                        status = ?,
                        expected_arrival_time = ?
                    WHERE hospital_id = ?
                    AND doctor = ?
                `;

                db.query(
                    updateSql,
                    [
                        status,
                        expectedArrivalTime || null,
                        hospitalId,
                        doctor
                    ],
                    (updateErr) => {

                        if (updateErr) {

                            console.error(
                                "Doctor availability update error:",
                                updateErr
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Unable to update doctor availability."
                            });

                        }

                        return res.json({
                            success: true,
                            message:
                                "Doctor availability updated successfully."
                        });

                    }
                );

            } else {

                const insertSql = `
                    INSERT INTO doctor_availability
                    (
                        hospital_id,
                        doctor,
                        status,
                        expected_arrival_time
                    )
                    VALUES (?, ?, ?, ?)
                `;

                db.query(
                    insertSql,
                    [
                        hospitalId,
                        doctor,
                        status,
                        expectedArrivalTime || null
                    ],
                    (insertErr) => {

                        if (insertErr) {

                            console.error(
                                "Doctor availability insert error:",
                                insertErr
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Unable to save doctor availability."
                            });

                        }

                        res.json({
                            success: true,
                            message:
                                "Doctor availability saved successfully."
                        });

                    }
                );

            }

        }
    );

});

app.get("/hospital-stats/:hospitalId", (req, res) => {

    const hospitalId = req.params.hospitalId;

    const sql = `
        SELECT
            COUNT(*) AS patients,
            SUM(CASE WHEN status = 'Waiting' THEN 1 ELSE 0 END) AS waiting,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM live_queue
        WHERE hospital_id = ?
        AND DATE(appointment_time) = CURDATE()
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital stats error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load hospital statistics."
                });

            }

            const stats = results[0];

            res.json({
                success: true,
                stats: {
                    patients: Number(stats.patients) || 0,
                    waiting: Number(stats.waiting) || 0,
                    completed: Number(stats.completed) || 0
                }
            });

        }
    );

});

app.get("/hospital-appointments-count/:hospitalId", (req, res) => {

    const hospitalId = req.params.hospitalId;

    const sql = `
        SELECT COUNT(*) AS appointments
        FROM appointments
        WHERE hospital_id = ?
        AND DATE(appointment_time) = CURDATE()
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital appointments count error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load appointment count."
                });

            }

            res.json({
                success: true,
                appointments:
                    Number(results[0].appointments) || 0
            });

        }
    );

});
app.get("/hospital-appointments/:hospitalId", (req, res) => {

    const hospitalId = req.params.hospitalId;

    const sql = `
        SELECT
            a.id,
            a.patient_id,
            a.hospital_id,
            a.doctor,
            a.token,
            a.status,
            a.appointment_time,
            p.name AS patient_name
        FROM appointments a
        LEFT JOIN patients p
            ON a.patient_id = p.id
        WHERE a.hospital_id = ?
        ORDER BY a.appointment_time DESC
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital appointments error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load hospital appointments."
                });

            }

            res.json({
                success: true,
                appointments: results
            });

        }
    );

});

app.get("/hospital-appointment-summary/:hospitalId", (req, res) => {

    const hospitalId = req.params.hospitalId;

    const sql = `
        SELECT
            COUNT(*) AS total,
            SUM(
                CASE
                    WHEN status = 'Completed'
                    THEN 1
                    ELSE 0
                END
            ) AS completed,
            SUM(
                CASE
                    WHEN status <> 'Completed'
                    THEN 1
                    ELSE 0
                END
            ) AS remaining
        FROM appointments
        WHERE hospital_id = ?
        AND DATE(appointment_time) = CURDATE()
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital appointment summary error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load appointment summary."
                });

            }

            const row = results[0];

            res.json({
                success: true,

                total:
                    Number(row.total) || 0,

                completed:
                    Number(row.completed) || 0,

                remaining:
                    Number(row.remaining) || 0
            });

        }
    );

});

app.post("/hospital-create-appointment", (req, res) => {

    const {
        patientId,
        hospitalId,
        doctor,
        token
    } = req.body;

    if (!patientId || !hospitalId || !doctor || !token) {

        return res.status(400).json({
            success: false,
            message:
                "Patient, hospital, doctor and token are required."
        });

    }

    const sql = `
        INSERT INTO appointments
        (
            patient_id,
            hospital_id,
            doctor,
            token,
            status
        )
        VALUES (?, ?, ?, ?, 'Waiting')
    `;

    db.query(
        sql,
        [
            patientId,
            hospitalId,
            doctor,
            token
        ],
        (err, result) => {

            if (err) {

                console.error(
                    "Hospital appointment creation error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to create appointment."
                });

            }

            console.log(
    "Hospital appointment created. ID:",
    result.insertId
);

// CREATE HOSPITAL NOTIFICATION
const notificationSql = `
    INSERT INTO notifications
    (
        hospital_id,
        title,
        message,
        type
    )
    VALUES (?, ?, ?, ?)
`;

db.query(
    notificationSql,
    [
        hospitalId,
        "New Appointment",
        "A new patient appointment has been added to your hospital.",
        "appointment"
    ],
    (notificationErr) => {

        if (notificationErr) {
            console.error(
                "Hospital notification creation error:",
                notificationErr
            );
        }

        // Appointment creation remains successful
        return res.json({
            success: true,
            message: "Appointment created successfully.",
            appointmentId: result.insertId
        });
    }
);

        }
    );

});

// ======================================================
// GET LIVE QUEUE FOR PATIENT
// ======================================================

app.get("/patient-live-queue/:patientId", (req, res) => {

    const patientId = req.params.patientId;

    const sql = `
        SELECT
            id,
            hospital_id,
            patient_name,
            phone,
            doctor,
            token,
            status,
            appointment_time
        FROM live_queue
        WHERE phone = (
            SELECT phone
            FROM patients
            WHERE id = ?
            LIMIT 1
        )
        AND DATE(appointment_time) = CURDATE()
        ORDER BY id DESC
    `;

    db.query(
        sql,
        [patientId],
        (err, results) => {

            if (err) {

                console.error(
                    "Patient queue fetch error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load patient queue."
                });

            }

            res.json({
                success: true,
                queue: results
            });

        }
    );

});



        
// ======================================================
// CALL NEXT PATIENT
// ======================================================

app.put("/live-queue/call-next", (req, res) => {

    const { hospitalId, doctor } = req.body;

    if (!hospitalId || !doctor) {
        return res.status(400).json({
            success: false,
            message: "Hospital ID and doctor are required."
        });
    }

    const findSql = `
        SELECT
            lq.id,
            COALESCE(lq.patient_id, p.id) AS patient_id,
            lq.patient_name,
            lq.phone,
            lq.token
        FROM live_queue lq
        LEFT JOIN patients p
            ON p.phone = lq.phone
        WHERE lq.hospital_id = ?
        AND lq.doctor = ?
        AND lq.status = 'Waiting'
        AND DATE(lq.appointment_time) = CURDATE()
        ORDER BY lq.id ASC
        LIMIT 1
    `;

    db.query(
        findSql,
        [hospitalId, doctor],
        (err, results) => {

            if (err) {
                console.error("Call next lookup error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to find next patient."
                });
            }

            if (results.length === 0) {
                return res.json({
                    success: false,
                    message: "No waiting patient."
                });
            }

            const patient = results[0];

            db.query(
                `
                    UPDATE live_queue
                    SET status = 'In Consultation'
                    WHERE id = ?
                `,
                [patient.id],
                (err) => {

                    if (err) {
                        console.error("Call next update error:", err);

                        return res.status(500).json({
                            success: false,
                            message: "Unable to call patient."
                        });
                    }

                    // PATIENT TOKEN CALLED NOTIFICATION
                    const patientNotificationSql = `
                        INSERT INTO patient_notifications
                        (
                            patient_id,
                            token,
                            title,
                            message,
                            type
                        )
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    db.query(
                        patientNotificationSql,
                        [
                            patient.patient_id,
                            patient.token,
                            "Token Called",
                            `Your token ${patient.token} is being called. Please proceed to the ${doctor}.`,
                            "queue"
                        ],
                        (patientNotificationErr) => {

                            if (patientNotificationErr) {
                                console.error(
                                    "Patient token notification error:",
                                    patientNotificationErr
                                );
                            }

                            // EXISTING HOSPITAL NOTIFICATION
                            const notificationSql = `
                                INSERT INTO notifications
                                (
                                    hospital_id,
                                    title,
                                    message,
                                    type
                                )
                                VALUES (?, ?, ?, ?)
                            `;

                            db.query(
                                notificationSql,
                                [
                                    hospitalId,
                                    "Token Called",
                                    `${patient.patient_name} (Token ${patient.token}) has been called for ${doctor}.`,
                                    "queue"
                                ],
                                (notificationErr) => {

                                    if (notificationErr) {
                                        console.error(
                                            "Token notification creation error:",
                                            notificationErr
                                        );
                                    }
 // FIND NEXT WAITING PATIENT
const nextPatientSql = `
    SELECT
        COALESCE(lq.patient_id, p.id) AS patient_id,
        lq.token
    FROM live_queue lq
    LEFT JOIN patients p
        ON p.phone = lq.phone
    WHERE lq.hospital_id = ?
    AND lq.doctor = ?
    AND lq.status = 'Waiting'
    AND DATE(lq.appointment_time) = CURDATE()
    ORDER BY lq.id ASC
    LIMIT 1
`;

db.query(
    nextPatientSql,
    [hospitalId, doctor],
    (nextPatientErr, nextPatients) => {

        if (nextPatientErr) {
            console.error(
                "Next patient lookup error:",
                nextPatientErr
            );

            return res.json({
                success: true,
                message:
                    `${patient.patient_name} has been called out for ${doctor}.`,
                patient: patient
            });
        }

        // SEND GET READY TO NEXT PATIENT
        if (nextPatients.length > 0) {

            const nextPatient =
                nextPatients[0];

            const getReadySql = `
                INSERT INTO patient_notifications
                (
                    patient_id,
                    token,
                    title,
                    message,
                    type
                )
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(
                getReadySql,
                [
                    nextPatient.patient_id,
                    nextPatient.token,
                    "Get Ready",
                    `Your token ${nextPatient.token} is approaching. Please be ready.`,
                    "queue"
                ],
                (getReadyErr) => {

                    if (getReadyErr) {
                        console.error(
                            "Get Ready notification error:",
                            getReadyErr
                        );
                    }

                    return res.json({
                        success: true,
                        message:
                            `${patient.patient_name} has been called out for ${doctor}.`,
                        patient: patient
                    });

                }
            );

        } else {

            return res.json({
                success: true,
                message:
                    `${patient.patient_name} has been called out for ${doctor}.`,
                patient: patient
            });

        }

    }
);

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});
// ======================================================
// APPOINTMENTS
// ======================================================

app.post("/appointments", (req, res) => {
    const { patient_id, hospital_id, doctor, token } = req.body;

    if (!patient_id || !hospital_id || !doctor || !token) {
        return res.status(400).json({
            success: false,
            message: "Patient, hospital, doctor and token are required."
        });
    }

    const sql = `
        INSERT INTO appointments
        (patient_id, hospital_id, doctor, token, status)
        VALUES (?, ?, ?, ?, 'Waiting')
    `;

    db.query(
        sql,
        [patient_id, hospital_id, doctor, token],
        (err, result) => {
            if (err) {
                console.error("Appointment insert error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to create appointment."
                });
            }

            console.log(
                "Patient appointment created. ID:",
                result.insertId
            );

            const notificationSql = `
                INSERT INTO notifications
                (hospital_id, title, message, type)
                VALUES (?, ?, ?, ?)
            `;

            db.query(
                notificationSql,
                [
                    hospital_id,
                    "New Appointment",
                    `A new patient has booked an appointment for ${doctor}. Token: ${token}.`,
                    "appointment"
                ],
                (notificationErr) => {
                    if (notificationErr) {
                        console.error(
                            "Hospital notification creation error:",
                            notificationErr
                        );
                    }

                    return res.json({
                        success: true,
                        message: "Appointment created successfully.",
                        appointmentId: result.insertId
                    });
                }
            );
        }
    );
});
app.get("/appointments/:patientId", (req, res) => {

    const patientId = req.params.patientId;

    const sql = `
        SELECT
            a.id,
            a.patient_id,
            a.hospital_id,
            a.doctor,
            a.token,
            a.status,
            a.appointment_time,
            h.name AS hospital_name
        FROM appointments a
        LEFT JOIN hospitals h
            ON a.hospital_id = h.id
        WHERE a.patient_id = ?
        ORDER BY a.id DESC
    `;

    db.query(
        sql,
        [patientId],
        (err, results) => {

            if (err) {

                console.error(
                    "Appointment history error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load appointment history."
                });

            }

            res.json({
                success: true,
                appointments: results
            });

        }
    );

});
app.get("/appointments/:patientId", (req, res) => {

    const patientId = req.params.patientId;

    const sql = `
        SELECT
            a.id,
            a.patient_id,
            a.hospital_id,
            a.doctor,
            a.token,
            a.status,
            a.appointment_time,
            h.name AS hospital_name
        FROM appointments a
        LEFT JOIN hospitals h
        ON a.hospital_id = h.id
        WHERE a.patient_id = ?
        ORDER BY a.id DESC
    `;

    db.query(
        sql,
        [patientId],
        (err, results) => {

            if (err) {

                console.error(
                    "Appointment history error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load appointment history."
                });

            }

            res.json({
                success: true,
                appointments: results
            });

        }
    );

});

// ======================================================
// APPOINTMENT HISTORY
// ======================================================

app.put("/live-queue/complete", (req, res) => {

    const { hospitalId, doctor } = req.body;

    if (!hospitalId || !doctor) {
        return res.status(400).json({
            success: false,
            message: "Hospital and doctor are required."
        });
    }

    // Find the patient currently in consultation
    const findSql = `
    SELECT
        lq.id,
        lq.patient_id,
        lq.hospital_id,
        lq.patient_name,
        lq.doctor,
        lq.token,
        lq.status
    FROM live_queue lq
    INNER JOIN appointments a
        ON a.patient_id = lq.patient_id
        AND a.hospital_id = lq.hospital_id
        AND a.doctor = lq.doctor
        AND a.token = lq.token
    WHERE lq.hospital_id = ?
    AND lq.doctor = ?
    AND lq.status = 'In Consultation'
    AND a.status <> 'Completed'
    AND DATE(lq.appointment_time) = CURDATE()
    ORDER BY lq.id DESC
    LIMIT 1
`;

    db.query(
        findSql,
        [hospitalId, doctor],
        (err, results) => {

            if (err) {
                console.error(
                    "Find consultation error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to find consultation."
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "No patient is currently in consultation."
                });
            }

            const patient = results[0];

            // Update the matching appointment directly
            // using hospital + doctor + token
            const updateAppointmentSql = `
                UPDATE appointments
                SET status = 'Completed'
                WHERE hospital_id = ?
                AND doctor = ?
                AND token = ?
                AND status <> 'Completed'
            `;

            db.query(
                updateAppointmentSql,
                [
                    patient.hospital_id,
                    doctor,
                    patient.token
                ],
                (err, appointmentResult) => {

                    if (err) {
                        console.error(
                            "Appointment update error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Unable to update appointment status."
                        });
                    }

                    if (appointmentResult.affectedRows === 0) {
                        console.error(
                            "No matching appointment found for token:",
                            patient.token
                        );

                        return res.status(404).json({
                            success: false,
                            message:
                                "Matching appointment not found."
                        });
                    }

                    // Now complete the hospital live queue
                    const updateQueueSql = `
                        UPDATE live_queue
                        SET status = 'Completed'
                        WHERE id = ?
                    `;

                    db.query(
                        updateQueueSql,
                        [patient.id],
                        (err) => {

                            if (err) {
                                console.error(
                                    "Queue update error:",
                                    err
                                );

                                return res.status(500).json({
                                    success: false,
                                    message:
                                        "Appointment completed but queue update failed."
                                });
                            }

                            // EXISTING PATIENT NOTIFICATION
                            notifications[patient.token] = {
                                message:
                                    `Your consultation for ${doctor} has been completed.`,
                                createdAt: new Date()
                            };

                            // SAVE PATIENT NOTIFICATION HISTORY
                            const patientNotificationSql = `
                                INSERT INTO patient_notifications
                                (
                                    patient_id,
                                    token,
                                    title,
                                    message,
                                    type
                                )
                                VALUES (?, ?, ?, ?, ?)
                            `;

                            db.query(
                                patientNotificationSql,
                                [
                                    patient.patient_id,
                                    patient.token,
                                    "Consultation Completed",
                                    `Your consultation for ${doctor} has been completed.`,
                                    "consultation"
                                ],
                                (patientNotificationErr) => {

                                    if (patientNotificationErr) {
                                        console.error(
                                            "Patient consultation notification history error:",
                                            patientNotificationErr
                                        );
                                    }

                                    // CREATE HOSPITAL NOTIFICATION
                                    const notificationSql = `
                                        INSERT INTO notifications
                                        (
                                            hospital_id,
                                            title,
                                            message,
                                            type
                                        )
                                        VALUES (?, ?, ?, ?)
                                    `;

                                    db.query(
                                        notificationSql,
                                        [
                                            hospitalId,
                                            "Consultation Completed",
                                            `${patient.patient_name}'s consultation for ${doctor} has been completed.`,
                                            "consultation"
                                        ],
                                        (notificationErr) => {

                                            if (notificationErr) {
                                                console.error(
                                                    "Consultation notification creation error:",
                                                    notificationErr
                                                );
                                            }

                                            // EXISTING SUCCESS RESPONSE
                                            res.json({
                                                success: true,
                                                message:
                                                    "Consultation completed successfully."
                                            });

                                        }
                                    );

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});
// ======================================================
// ADMIN LOGIN
// ======================================================

app.post("/admin-login", (req, res) => {

    const {
        username,
        password
    } = req.body;

    if (!username || !password) {

        return res.status(400).json({
            success: false,
            message:
                "Please enter username and password."
        });

    }

    const sql = `
        SELECT
            id,
            username,
            name,
            role,
            status
        FROM admins
        WHERE username = ?
        AND password = ?
        AND status = 'Active'
        LIMIT 1
    `;

    db.query(
        sql,
        [
            username,
            password
        ],
        (err, results) => {

            if (err) {

                console.error(
                    "Admin login error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Database error."
                });

            }

            if (results.length === 0) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid username or password."
                });

            }

            const admin =
                results[0];

            res.json({
                success: true,
                message:
                    "Admin login successful!",
                admin:
                    admin
            });

        }
    );

});
// ======================================================
// ADMIN - GET ALL HOSPITALS
// ======================================================

app.get("/admin/hospitals", (req, res) => {

    const sql = `
        SELECT
            id,
            hospital_id,
            name,
            email,
            phone,
            address,
            status,
            reactivation_status,
            created_at
        FROM hospitals
        ORDER BY id DESC
    `;

    db.query(
        sql,
        (err, results) => {

            if (err) {

                console.error(
                    "Admin hospital loading error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load hospitals."
                });

            }

            res.json({
                success: true,
                hospitals:
                    results
            });

        }
    );

});

// ======================================================
// ADMIN - APPROVE HOSPITAL
// ======================================================
console.log("APPROVE HOSPITAL ROUTE LOADED");
app.put("/admin/approve-hospital/:id", (req, res) => {
    console.log("APPROVE REQUEST RECEIVED:",req.params.id);

    const hospitalId = req.params.id;

    // First approve the hospital
    db.query(
        `
            UPDATE hospitals
            SET status = 'Active'
            WHERE id = ?
            AND status = 'Pending'
        `,
        [hospitalId],
        (err, result) => {

            if (err) {

                console.error(
                    "Hospital approval error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to approve hospital."
                });

            }

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Pending hospital not found."
                });

            }

            // Get hospital name
            db.query(
                `
                    SELECT name
                    FROM hospitals
                    WHERE id = ?
                    LIMIT 1
                `,
                [hospitalId],
                (err, hospitalResults) => {

                    if (err) {

                        console.error(
                            "Hospital notification lookup error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Hospital approved, but notification could not be created."
                        });

                    }

                    const hospitalName =
                        hospitalResults[0].name;

                    // Create notification
                    db.query(
                        `
                            INSERT INTO hospital_notifications
                            (hospital_id, message)
                            VALUES (?, ?)
                        `,
                        [
                            hospitalId,
                            `Your hospital ${hospitalName} has been approved by Admin. You can now use QCare.`
                        ],
                        (err) => {

                            if (err) {

                                console.error(
                                    "Hospital notification error:",
                                    err
                                );

                                return res.status(500).json({
                                    success: false,
                                    message:
                                        "Hospital approved, but notification could not be created."
                                });

                            }

                            res.json({
                                success: true,
                                message:
                                    "Hospital approved successfully and notification sent."
                            });

                        }
                    );

                }
            );

        }
    );

});
// ======================================================
// ADMIN - REJECT HOSPITAL
// ======================================================

app.put("/admin/reject-hospital/:id", (req, res) => {

    const hospitalId =
        req.params.id;

    db.query(
        `
            UPDATE hospitals
            SET status = 'Rejected'
            WHERE id = ?
            AND status = 'Pending'
        `,
        [hospitalId],
        (err, result) => {

            if (err) {

                console.error(
                    "Hospital rejection error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to reject hospital."
                });

            }

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Pending hospital not found."
                });

            }

            res.json({
                success: true,
                message:
                    "Hospital rejected successfully."
            });

        }
    );

});

// ======================================================
// DEACTIVATE HOSPITAL
// ======================================================

app.put("/deactivate-hospital/:id", (req, res) => {

    const hospitalId =
        req.params.id;

    db.query(
        `
            UPDATE hospitals
            SET status = 'Deactivated'
            WHERE id = ?
        `,
        [hospitalId],
        (err, result) => {

            if (err) {

                console.error(
                    "Hospital deactivation error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to deactivate hospital."
                });

            }

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Hospital not found."
                });

            }

            res.json({
                success: true,
                message:
                    "Hospital deactivated successfully."
            });

        }
    );

});

// ======================================================
// REQUEST REACTIVATION
// ======================================================
console.log("REQUEST REACTIVATION ROUTE LOADED");
console.log("ABOUT TO REGISTER REACTIVATION POST ROUTE");
app.post("/request-reactivation", (req, res) => {

    const email = req.body.email;

    console.log("REACTIVATION REQUEST:", email);

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Hospital email is required."
        });
    }

    const sql = `
        SELECT id, name, status
        FROM hospitals
        WHERE email = ?
        LIMIT 1
    `;

    db.query(sql, [email], (err, results) => {

        if (err) {
            console.error("Reactivation database error:", err);

            return res.status(500).json({
                success: false,
                message: "Database error."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found."
            });
        }

        const hospital = results[0];

        if (hospital.status !== "Deactivated") {
            return res.status(400).json({
                success: false,
                message:
                    "Only deactivated hospitals can request reactivation."
            });
        }

        const insertSql = `
            INSERT INTO reactivation_requests
            (hospital_id, status)
            VALUES (?, 'Pending')
        `;

        db.query(
            insertSql,
            [hospital.id],
            (err) => {

                if (err) {

                    console.error(
                        "Reactivation request insert error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Unable to send reactivation request."
                    });
                }

                res.json({
                    success: true,
                    message:
                        "Reactivation request sent to Admin successfully."
                });

            }
        );

    });

});

// ======================================================
// ADMIN - GET REACTIVATION REQUESTS
// ======================================================

app.get("/admin/reactivation-requests", (req, res) => {

    const sql = `
        SELECT
            rr.id,
            rr.hospital_id,
            rr.status,
            rr.requested_at,
            rr.reviewed_at,
            h.hospital_id AS hospital_code,
            h.name,
            h.email,
            h.phone,
            h.address
        FROM reactivation_requests rr
        JOIN hospitals h
        ON rr.hospital_id = h.id
        WHERE rr.status = 'Pending'
        ORDER BY rr.id DESC
    `;

    db.query(
        sql,
        (err, results) => {

            if (err) {

                console.error(
                    "Reactivation request loading error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load reactivation requests."
                });

            }

            res.json({
                success: true,
                requests:
                    results
            });

        }
    );

});

// ======================================================
// ADMIN - APPROVE REACTIVATION
// ======================================================

app.put(
    "/admin/approve-reactivation/:requestId",
    (req, res) => {

        const requestId =
            req.params.requestId;

        const getRequestSql = `
            SELECT
                rr.hospital_id,
                rr.status,
                h.name
            FROM reactivation_requests rr
            JOIN hospitals h
            ON rr.hospital_id = h.id
            WHERE rr.id = ?
            LIMIT 1
        `;

        db.query(
            getRequestSql,
            [requestId],
            (err, results) => {

                if (err) {

                    console.error(
                        "Reactivation approval request error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Database error."
                    });

                }

                if (results.length === 0) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Reactivation request not found."
                    });

                }

                const request =
                    results[0];

                if (
                    request.status !==
                    "Pending"
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "This request has already been reviewed."
                    });

                }

                const hospitalId =
                    request.hospital_id;

                const hospitalName =
                    request.name;

                // Reactivate hospital
                db.query(
                    `
                        UPDATE hospitals
                        SET status = 'Active'
                        WHERE id = ?
                        AND status = 'Deactivated'
                    `,
                    [hospitalId],
                    (err, hospitalResult) => {

                        if (err) {

                            console.error(
                                "Hospital reactivation error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Unable to reactivate hospital."
                            });

                        }

                        if (
                            hospitalResult.affectedRows === 0
                        ) {

                            return res.status(400).json({
                                success: false,
                                message:
                                    "Hospital is not currently deactivated."
                            });

                        }

                        // Mark request as Approved
                        db.query(
                            `
                                UPDATE reactivation_requests
                                SET
                                    status = 'Approved',
                                    reviewed_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            `,
                            [requestId],
                            (err) => {

                                if (err) {

                                    console.error(
                                        "Reactivation request update error:",
                                        err
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message:
                                            "Hospital was reactivated, but request update failed."
                                    });

                                }

                                // Create hospital notification
                                db.query(
                                    `
                                        INSERT INTO hospital_notifications
                                        (hospital_id, message)
                                        VALUES (?, ?)
                                    `,
                                    [
                                        hospitalId,
                                        `Your hospital ${hospitalName} has been reactivated by Admin. You can now use QCare again.`
                                    ],
                                    (err) => {

                                        if (err) {

                                            console.error(
                                                "Reactivation notification error:",
                                                err
                                            );

                                            return res.status(500).json({
                                                success: false,
                                                message:
                                                    "Hospital was reactivated, but notification could not be created."
                                            });

                                        }

                                        res.json({
                                            success: true,
                                            message:
                                                "Hospital reactivated successfully and notification sent."
                                        });

                                    }
                                );

                            }
                        );

                    }
                );

            }
        );

    }
);

// ======================================================
// NOTIFICATIONS
// ======================================================


app.post("/send-notification", (req, res) => {

    const {
        token,
        message
    } = req.body;

    if (!token || !message) {

        return res.status(400).json({
            success: false,
            message:
                "Token and message are required."
        });

    }

    notifications[token] = {
        message: message,
        createdAt: new Date()
    };

    res.json({
        success: true,
        message:
            "Notification sent successfully."
    });

});

app.get("/notification/:token", (req, res) => {

    const token =
        req.params.token;

    const notification =
        notifications[token];

    if (!notification) {

        return res.json({
            success: true,
            notification: null
        });

    }

    res.json({
        success: true,
        notification:
            notification
    });

});

// ===============================
// GET PATIENT NOTIFICATION HISTORY
// ===============================

app.get("/patient-notifications/:patientId", (req, res) => {

    const patientId = req.params.patientId;

    const sql = `
        SELECT
            id,
            patient_id,
            token,
            title,
            message,
            type,
            is_read,
            created_at
        FROM patient_notifications
        WHERE patient_id = ?
        ORDER BY created_at DESC
    `;

    db.query(
        sql,
        [patientId],
        (err, results) => {

            if (err) {

                console.error(
                    "Patient notification history error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load patient notifications."
                });
            }

            res.json({
                success: true,
                notifications: results
            });
        }
    );
});

app.put("/patient-notifications/:id/read", (req, res) => {

    const notificationId = req.params.id;

    const sql = `
        UPDATE patient_notifications
        SET is_read = 1
        WHERE id = ?
    `;

    db.query(
        sql,
        [notificationId],
        (err, result) => {

            if (err) {
                console.error(
                    "Mark notification read error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to mark notification as read."
                });
            }

            console.log(
                "READ ROUTE CALLED:",
                notificationId,
                "Rows changed:",
                result.affectedRows
            );

            res.json({
                success: true
            });
        }
    );
});
// ======================================================
// FORGOT PASSWORD - CREATE RESET TOKEN
// ======================================================

app.post("/forgot-password", (req, res) => {

    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email is required."
        });
    }

    const sql = `
        SELECT id, name, email
        FROM hospitals
        WHERE email = ?
        LIMIT 1
    `;

    db.query(sql, [email], (err, results) => {

        if (err) {

            console.error(
                "Forgot password lookup error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Database error."
            });

        }

        if (results.length === 0) {

            return res.status(404).json({
                success: false,
                message: "No hospital account found with this email."
            });

        }

        const hospital = results[0];

        // Generate a secure random token
        const crypto = require("crypto");

        const token =
            crypto.randomBytes(32).toString("hex");

        // Token valid for 15 minutes
        const expiresAt =
            new Date(Date.now() + 15 * 60 * 1000);

        const insertSql = `
            INSERT INTO password_reset_tokens
            (
                hospital_id,
                token,
                expires_at,
                used
            )
            VALUES (?, ?, ?, FALSE)
        `;

        db.query(
            insertSql,
            [
                hospital.id,
                token,
                expiresAt
            ],
            (err) => {

                if (err) {

                    console.error(
                        "Reset token creation error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Unable to create password reset request."
                    });

                }

                console.log(
                    "Password reset token created for:",
                    hospital.email
                );

                res.json({
                    success: true,
                    message:
                        "Password reset request created successfully.",
                    token: token
                });

            }
        );

    });

});
// ======================================================
// RESET PASSWORD - OTP VERIFIED
// ======================================================

app.post("/reset-password", async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and new password are required."
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters."
        });
    }

    const record = otpStore[email];

    if (!record || record.verified !== true) {
        return res.status(403).json({
            success: false,
            message: "Please verify your OTP first."
        });
    }

    if (Date.now() > record.expires) {

        delete otpStore[email];

        return res.status(400).json({
            success: false,
            message: "OTP verification has expired."
        });
    }

    try {

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const sql = `
            UPDATE hospitals
            SET password = ?
            WHERE email = ?
        `;

        db.query(
            sql,
            [hashedPassword, email],
            (err, result) => {

                if (err) {

                    console.error(
                        "Password update error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Unable to update password."
                    });
                }

                if (result.affectedRows === 0) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Hospital account not found."
                    });
                }

                // OTP verification can be used only once
                delete otpStore[email];

                console.log(
                    "Password reset successfully for:",
                    email
                );

                res.json({
                    success: true,
                    message:
                        "Password reset successfully."
                });

            }
        );

    } catch (error) {

        console.error(
            "Password hashing error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to process password reset."
        });
    }

});
// ======================================================
// OTP - DEVELOPMENT VERSION
// ======================================================

const otpStore = {};

app.post("/send-otp", (req, res) => {

    const {
        email
    } = req.body;

    if (!email) {

        return res.status(400).json({
            success: false,
            message:
                "Email is required."
        });

    }

    const otp =
        Math.floor(
            100000 +
            Math.random() * 900000
        ).toString();

    otpStore[email] = {
        otp: otp,
        expires:
            Date.now() + 5 * 60 * 1000
    };

    console.log(
        `OTP for ${email}: ${otp}`
    );

    res.json({
        success: true,
        message:
            "OTP generated successfully."
    });

});

app.post("/verify-otp", (req, res) => {

    const {
        email,
        otp
    } = req.body;

    if (!email || !otp) {

        return res.status(400).json({
            success: false,
            message:
                "Email and OTP are required."
        });

    }

    const record =
        otpStore[email];

    if (!record) {

        return res.status(400).json({
            success: false,
            message:
                "OTP not found."
        });

    }

    if (
        Date.now() >
        record.expires
    ) {

        delete otpStore[email];

        return res.status(400).json({
            success: false,
            message:
                "OTP has expired."
        });

    }

    if (
        record.otp !==
        otp
    ) {

        return res.status(400).json({
            success: false,
            message:
                "Invalid OTP."
        });

    }

    otpStore[email] = {
    verified: true,
    expires:
        Date.now() + 10 * 60 * 1000
};

res.json({
    success: true,
    message:
        "OTP verified successfully."
});

});
// ======================================================
// HOSPITAL PROFILE - UPDATE INFORMATION
// ======================================================

app.put("/hospital-profile/:id", (req, res) => {

    const hospitalId = req.params.id;

    const {
        name,
        email,
        phone,
        address
    } = req.body;

    // Check required fields
    if (!name || !email || !phone || !address) {

        return res.status(400).json({
            success: false,
            message: "Please fill all hospital information."
        });

    }

    // Validate phone number
    if (!/^[6-9][0-9]{9}$/.test(phone)) {

        return res.status(400).json({
            success: false,
            message: "Enter a valid 10-digit mobile number."
        });

    }

    // Check whether another hospital already uses
    // this email or phone number
    const checkSql = `
        SELECT id
        FROM hospitals
        WHERE (email = ? OR phone = ?)
        AND id <> ?
        LIMIT 1
    `;

    db.query(
        checkSql,
        [email, phone, hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital profile check error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Database error."
                });

            }

            if (results.length > 0) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email or phone number is already used by another hospital."
                });

            }

            const updateSql = `
                UPDATE hospitals
                SET
                    name = ?,
                    email = ?,
                    phone = ?,
                    address = ?
                WHERE id = ?
            `;

            db.query(
                updateSql,
                [
                    name,
                    email,
                    phone,
                    address,
                    hospitalId
                ],
                (err, result) => {

                    if (err) {

                        console.error(
                            "Hospital profile update error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "Unable to update hospital profile."
                        });

                    }

                    if (result.affectedRows === 0) {

                        return res.status(404).json({
                            success: false,
                            message:
                                "Hospital not found."
                        });

                    }

                    // Get updated hospital information
                    const selectSql = `
                        SELECT
                            id,
                            hospital_id,
                            name,
                            email,
                            phone,
                            address,
                            status
                        FROM hospitals
                        WHERE id = ?
                        LIMIT 1
                    `;

                    db.query(
                        selectSql,
                        [hospitalId],
                        (err, results) => {

                            if (err) {

                                console.error(
                                    "Updated hospital fetch error:",
                                    err
                                );

                                return res.status(500).json({
                                    success: false,
                                    message:
                                        "Profile updated, but updated information could not be loaded."
                                });

                            }

                            res.json({
                                success: true,
                                message:
                                    "Hospital profile updated successfully.",
                                hospital:
                                    results[0]
                            });

                        }
                    );

                }
            );

        }
    );

});

app.get("/hospital-profile/:id", (req, res) => {

    const hospitalId = req.params.id;

    if (!hospitalId) {
        return res.status(400).json({
            success: false,
            message: "Hospital ID is required."
        });
    }

    const sql = `
        SELECT
            id,
            hospital_id,
            name,
            email,
            phone,
            address,
            status
        FROM hospitals
        WHERE id = ?
        LIMIT 1
    `;

    db.query(
        sql,
        [hospitalId],
        (err, results) => {

            if (err) {

                console.error(
                    "Hospital details fetch error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load hospital details."
                });
            }

            if (results.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Hospital not found."
                });
            }

            res.json({
                success: true,
                hospital: results[0]
            });

        }
    );
});

// ==========================================
// DEACTIVATE HOSPITAL
// ==========================================

app.put("/hospital-deactivate/:id", (req, res) => {

    const hospitalId = req.params.id;

    const sql = `
        UPDATE hospitals
        SET status = 'Deactivated',
            reactivation_status = NULL
        WHERE id = ?
    `;

    db.query(
        sql,
        [hospitalId],
        (err, result) => {

            if (err) {

                console.error(
                    "Hospital deactivation error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to deactivate hospital."
                });

            }

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Hospital not found."
                });

            }

            console.log(
                "Hospital deactivated. ID:",
                hospitalId
            );

            return res.json({
                success: true,
                message:
                    "Hospital account deactivated successfully."
            });

        }
    );

});

// ==========================================
// REQUEST HOSPITAL REACTIVATION
// ==========================================

app.put("/hospital-request-reactivation/:id", (req, res) => {

    const hospitalId = req.params.id;
console.log(
    "REACTIVATION ROUTE CALLED. Hospital ID:",
    hospitalId
);
    // First check hospital status
    const checkSql = `
        SELECT id, status, reactivation_status
        FROM hospitals
        WHERE id = ?
    `;

    db.query(checkSql, [hospitalId], (err, results) => {

        if (err) {
            console.error(
                "Hospital reactivation check error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to submit reactivation request."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found."
            });
        }

        const hospital = results[0];

        console.log(
    "HOSPITAL STATUS:",
    hospital.status,
    "REACTIVATION STATUS:",
    hospital.reactivation_status
);

        if (hospital.status !== "Deactivated") {
            return res.status(400).json({
                success: false,
                message:
                    "Reactivation request can only be submitted for a deactivated hospital."
            });
        }

        if (
            hospital.reactivation_status === "Pending"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A reactivation request is already pending."
            });
        }

        // Create reactivation request
        const insertSql = `
            INSERT INTO reactivation_requests
            (
                hospital_id,
                status
            )
            VALUES (?, 'Pending')
        `;

        db.query(
            insertSql,
            [hospitalId],
            (err, result) => {

                if (err) {
                    console.error(
                        "Reactivation request insert error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Unable to submit reactivation request."
                    });
                }

                // Keep hospital's existing status field synchronized
                const updateHospitalSql = `
                    UPDATE hospitals
                    SET reactivation_status = 'Pending'
                    WHERE id = ?
                `;

                db.query(
                    updateHospitalSql,
                    [hospitalId],
                    (err) => {

                        if (err) {
                            console.error(
                                "Hospital reactivation status update error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message:
                                    "Request created, but hospital status could not be updated."
                            });
                        }

                        console.log(
                            "Hospital reactivation requested. Request ID:",
                            result.insertId
                        );

                        return res.json({
                            success: true,
                            message:
                                "Reactivation request submitted successfully."
                        });

                    }
                );

            }
        );

    });

});
// ======================================================
// START SERVER
// ======================================================
app.get("/check-patient-phone/:phone", (req, res) => {

    const phone = req.params.phone;

    const sql = `
        SELECT id
        FROM patients
        WHERE phone = ?
        LIMIT 1
    `;

    db.query(sql, [phone], (err, results) => {

        if (err) {

            console.error(
                "CHECK PATIENT PHONE ERROR:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to check phone number."
            });
        }

        if (results.length > 0) {

            return res.json({
                success: true,
                exists: true
            });
        }

        return res.json({
            success: true,
            exists: false
        });
    });

});
// ======================================================
// HOSPITAL NOTIFICATIONS
// ======================================================

// GET HOSPITAL NOTIFICATIONS
app.get("/hospital-notifications/:hospitalId", (req, res) => {
    const hospitalId = req.params.hospitalId;

    const sql = `
        SELECT
            id,
            hospital_id,
            title,
            message,
            type,
            is_read,
            created_at
        FROM notifications
        WHERE hospital_id = ?
        ORDER BY created_at DESC
    `;

    db.query(sql, [hospitalId], (err, results) => {
        if (err) {
            console.error(
                "Hospital notifications error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load notifications."
            });
        }

        res.json({
            success: true,
            notifications: results
        });
    });
});


// MARK NOTIFICATION AS READ
app.put("/hospital-notifications/read/:notificationId", (req, res) => {
    const notificationId = req.params.notificationId;

    const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ?
    `;

    db.query(sql, [notificationId], (err, result) => {
        if (err) {
            console.error(
                "Mark notification read error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update notification."
            });
        }

        res.json({
            success: true,
            message: "Notification marked as read."
        });
    });
});


// MARK ALL HOSPITAL NOTIFICATIONS AS READ
app.put("/hospital-notifications/read-all/:hospitalId", (req, res) => {
    const hospitalId = req.params.hospitalId;

    const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE hospital_id = ?
    `;

    db.query(sql, [hospitalId], (err, result) => {
        if (err) {
            console.error(
                "Mark all notifications read error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update notifications."
            });
        }

        res.json({
            success: true,
            message: "All notifications marked as read."
        });
    });
});
app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `QueueCare server running on port ${PORT}`
        );

    }
);