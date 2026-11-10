CREATE TABLE IF NOT EXISTS photo_students (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_students_student ON photo_students(student_id, photo_id);
