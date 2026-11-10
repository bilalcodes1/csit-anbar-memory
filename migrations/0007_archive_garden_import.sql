UPDATE albums SET published = 0
WHERE is_activity = 1
  AND slug IN ('garden-project', 'garden-plants')
  AND batch_id IN (SELECT id FROM batches WHERE year = 2025)
  AND EXISTS (
    SELECT 1 FROM photos
    WHERE album_id = albums.id AND object_key LIKE 'activities/garden/%'
  );
