DROP TABLE IF EXISTS file_list;

CREATE TABLE file_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL
);

DROP TABLE IF EXISTS file_chunk;

CREATE TABLE file_chunk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES file_list(id)
)
