from pathlib import Path
names=['upsert_customer','upsert_booking_vehicle','book_appointment_safe','save_appointment_booking_configuration','insert_booking_appointment_services','record_public_booking_payment_intent_v1','set_vehicle_tire_spec_v1']
for root in [Path('/home/ubuntu/ServiceWriterFinal/app'),Path('/home/ubuntu/ServiceWriterFinal/src')]:
  for p in root.rglob('*'):
    if p.is_file() and p.suffix in {'.ts','.tsx','.js','.jsx'}:
      text=p.read_text(errors='ignore')
      for n in names:
        if n in text:
          print(f'{p}:{n}')
