# SToNE
Run EESEN training in a VM in a browser, on AWS EC2 cloud AMI with GPU

It is assumed you've cloned this GitHub repository into a local working
folder.  It creates a folder `SToNE`. All commands in this document refer
to this working directory. For example
```
git clone http://github.com/riebling/SToNE
cd SToNE
```

## Requirements
### Tools
You will need
 * [Vagrant](http://vagrantup.com/)
 * [VirtualBox](http://virtualbox.org/)
 * Vagrant AWS and SSHFS plugins
 
 Before provisioning the VM, you need to install the two Vagrant plugins:
```
    vagrant plugin install vagrant-aws
    vagrant plugin install vagrant-sshfs
```
[Info about sshfs plugin](https://github.com/dustymabe/vagrant-sshfs) 

### AWS
This assumes familiarity with running Amazon Machine Images on Amazon EC2.
This requires an account with Amazon Web Services (AWS).
The instance type requires a GPU, and the training will take several days,
so be warned, compute charges can be on the order of magnitude of $100.

### Data
This experiment requires the TEDLIUM data set which can be obtained from
[OpenSLR](http://www.openslr.org/resources/7/TEDLIUM_release1.tar.gz).
It's really big (21 GB) so we do not distribute it. We prefer to store
it on the host computer in the working directory, so to obtain and unpack
it, from the working folder (`SToNE/`) execute these commands:
```
mkdir db
cd db
wget http://www.openslr.org/resources/7/TEDLIUM_release1.tar.gz
tar zxvf TEDLIUM_release1.tar.gz
```
This will create the `TEDLIUM_release1/` folder required by the system.

## AWS Configuration
On Amazon EC2 Management Console, in group `us-east-1` (N. Virginia)
under [Security Groups](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#SecurityGroups)
Edit or create a Security Group with Group Name 'default' on AWS Console; and with the Inbound tab, add:

  * An Inbound rule: HTTP
  * An Inbound rule: SSH
  * A Custom TCP Rule for port 6002 to the IP address you are running from
  * Another custom TCP rule for port 3000 also to your IP address

Edit the local file `aws.sh` with all the information from your Amazon AWS
account. You will need:

  * AWS_SECURITY_GROUP - described above, "deafult" by default (haha)
  * AWS_KEY - From when you first created your AWS account, or the 'My Account' menu drop-down with
  your user name (in the top right of EC2 Management Console)
  * AWS_SECRETKEY - when you created your AWS account, or from the "Security Credentials" selection
  from the drop-down menu as above
  * AWS_KEYPAIR - from the "Key Pairs" menu on the EC2 Management Console
  * AWS_PEM - also from the Key Pairs menu

## Instructions
Once you'e customized the aws.sh script. you can run it, which will set severeal environment
variables.
```
. aws.sh
```
Now it's time to launch the Amazon Machine Image
```
vagrant up
```
First you should see this output:
```
==> default: Warning! The AWS provider doesn't support any of the Vagrant
==> default: high-level network configurations (`config.vm.network`). They
==> default: will be silently ignored.
==> default: Starting the instance...
==> default: Waiting for instance to become "ready"...
```
While you're waiting, you can go to the Instances menu and check that an instance
is starting or running called 'Eesen Transcriber'. As it comes up you will see
more output:
```
==> default: Waiting for SSH to become available...
==> default: Machine is booted and ready for use!
==> default: Mounting SSHFS shared folder...
==> default: Mounting folder via SSHFS: /home/er1k/boxes/SToNE-github/SToNE => /vagrant
==> default: Checking Mount..
==> default: Checking Mount..
==> default: Folder Successfully Mounted!
==> default: Machine already provisioned. Run `vagrant provision` or use the `--provision`
==> default: flag to force provisioning. Provisioners marked to run always will still run.
==> default: Running provisioner: shell...
    default: Running: inline script
==> default: stdin: is not a tty
==> default: Point your Chrome or Safari browser to http://107.23.153.239:3000 to visit SToNE
```
Lots more output will happen the first time, as the VM is provisioned,
(applications and data are downloaded, configured, and compiled)

Now try pasting or opening that URL in a Chrome (or Safari) browser
(the IP address will be different)
