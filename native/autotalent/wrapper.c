#include <stdlib.h>
#include "ladspa.h"

extern const LADSPA_Descriptor *ladspa_descriptor(unsigned long i);
extern void _init(void);

static const LADSPA_Descriptor *desc;
static LADSPA_Handle inst;
static LADSPA_Data controls[64];
static LADSPA_Data *inbuf, *outbuf;
static unsigned long block_cap;
static int initialized;

int at_init(unsigned long sample_rate, unsigned long max_block) {
  if (inst) return 0;
  block_cap = max_block;
  if (!initialized) {
    _init();
    initialized = 1;
  }
  desc = ladspa_descriptor(0);
  if (!desc) return -1;
  inst = desc->instantiate(desc, sample_rate);
  if (!inst) return -2;
  inbuf = malloc(max_block * sizeof(LADSPA_Data));
  outbuf = malloc(max_block * sizeof(LADSPA_Data));
  for (unsigned long p = 0; p < desc->PortCount; p++) {
    LADSPA_PortDescriptor pd = desc->PortDescriptors[p];
    if (LADSPA_IS_PORT_AUDIO(pd)) {
      desc->connect_port(inst, p, LADSPA_IS_PORT_INPUT(pd) ? inbuf : outbuf);
    } else {
      controls[p] = 0;
      desc->connect_port(inst, p, &controls[p]);
    }
  }
  if (desc->activate) desc->activate(inst);
  return 0;
}

unsigned long at_port_count(void) { return desc->PortCount; }
const char *at_port_name(unsigned long p) { return desc->PortNames[p]; }
int at_port_is_control_input(unsigned long p) {
  LADSPA_PortDescriptor pd = desc->PortDescriptors[p];
  return LADSPA_IS_PORT_CONTROL(pd) && LADSPA_IS_PORT_INPUT(pd);
}
float at_port_lower(unsigned long p) { return desc->PortRangeHints[p].LowerBound; }
float at_port_upper(unsigned long p) { return desc->PortRangeHints[p].UpperBound; }
void at_set_control(unsigned long p, float v) { controls[p] = v; }
float at_get_control(unsigned long p) { return controls[p]; }
float *at_in_ptr(void) { return inbuf; }
float *at_out_ptr(void) { return outbuf; }
void at_process(unsigned long n) { desc->run(inst, n > block_cap ? block_cap : n); }
